import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createCoodanceMcpServer, CoodanceMcpServerDeps } from './server.js';

interface ManagedMcpSession {
  server: ReturnType<typeof createCoodanceMcpServer>;
  transport: StreamableHTTPServerTransport;
  lastActiveAt: number;
}

export interface MountMcpHttpOptions extends CoodanceMcpServerDeps {
  path?: string;
  isEnabled?: () => boolean;
  authorize?: (req: Request) => boolean;
  sessionTtlMs?: number;
}

export interface MountedMcpHttpHandle {
  close: () => Promise<void>;
  getActiveSessionCount: () => number;
}

export function mountCoodanceMcpHttp(
  app: Express,
  options: MountMcpHttpOptions = {},
): MountedMcpHttpHandle {
  const endpointPath = options.path || '/mcp';
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;
  const sessions = new Map<string, ManagedMcpSession>();

  const reaper = setInterval(() => {
    const cutoff = Date.now() - sessionTtlMs;
    for (const [sid, entry] of sessions.entries()) {
      if (entry.lastActiveAt < cutoff) {
        sessions.delete(sid);
        void entry.transport.close().catch(() => {});
        void entry.server.close().catch(() => {});
      }
    }
  }, 60_000);
  reaper.unref?.();

  const checkAccess = (req: Request, res: Response): boolean => {
    if (options.isEnabled && !options.isEnabled()) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'CooDance MCP HTTP endpoint is disabled in Studio settings.' },
        id: null,
      });
      return false;
    }
    if (options.authorize && !options.authorize(req)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: invalid or missing CooDance access token.' },
        id: null,
      });
      return false;
    }
    return true;
  };

  app.post(endpointPath, async (req: Request, res: Response) => {
    if (!checkAccess(req, res)) return;

    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    try {
      // 1. Existing stateful session
      if (sessionId && sessions.has(sessionId)) {
        const entry = sessions.get(sessionId)!;
        entry.lastActiveAt = Date.now();
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      // 2. New stateful session on initialize request
      if (!sessionId && isInitializeRequest(req.body)) {
        const server = createCoodanceMcpServer({
          getSettings: options.getSettings,
          renderJobManager: options.renderJobManager,
          onProgress: options.onProgress,
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            sessions.set(sid, { server, transport, lastActiveAt: Date.now() });
          },
          onsessionclosed: (sid) => {
            sessions.delete(sid);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
          void server.close().catch(() => {});
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // 3. Unknown session ID explicitly sent -> standard 404
      if (sessionId && !sessions.has(sessionId)) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Unknown or expired MCP session: ${sessionId}` },
          id: null,
        });
        return;
      }

      // 4. Stateless one-shot fallback for non-initialize calls without session header
      const statelessServer = createCoodanceMcpServer({
        getSettings: options.getSettings,
        renderJobManager: options.renderJobManager,
        onProgress: options.onProgress,
      });
      const statelessTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void statelessTransport.close().catch(() => {});
        void statelessServer.close().catch(() => {});
      });
      await statelessServer.connect(statelessTransport);
      await statelessTransport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : String(err),
          },
          id: null,
        });
      }
    }
  });

  app.get(endpointPath, async (req: Request, res: Response) => {
    if (!checkAccess(req, res)) return;
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Missing or invalid Mcp-Session-Id header for GET stream.' },
        id: null,
      });
      return;
    }

    const entry = sessions.get(sessionId)!;
    entry.lastActiveAt = Date.now();
    await entry.transport.handleRequest(req, res);
  });

  app.delete(endpointPath, async (req: Request, res: Response) => {
    if (!checkAccess(req, res)) return;
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found.' },
        id: null,
      });
      return;
    }

    const entry = sessions.get(sessionId)!;
    sessions.delete(sessionId);
    await entry.transport.handleRequest(req, res);
    await entry.transport.close().catch(() => {});
    await entry.server.close().catch(() => {});
  });

  return {
    getActiveSessionCount: () => sessions.size,
    close: async () => {
      clearInterval(reaper);
      const pending = Array.from(sessions.values()).map(async (entry) => {
        await entry.transport.close().catch(() => {});
        await entry.server.close().catch(() => {});
      });
      sessions.clear();
      await Promise.all(pending);
    },
  };
}
