import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { FSWatcher } from 'chokidar';
import { ProgressEvent } from '@coodance/core';

export type WsMessage =
  | { type: 'connected'; timestamp: string }
  | { type: 'progress'; payload: ProgressEvent }
  | {
      type: 'file-changed';
      payload: {
        projectSlug: string;
        relativePath: string;
        event: string;
        timestamp: string;
      };
    };

export class StudioEventHub {
  private wss: WebSocketServer;
  private watcher: FSWatcher | null = null;
  private watchedWorkspace = '';
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(server: http.Server, getAccessToken: () => string) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket, req) => {
      const requiredToken = getAccessToken();
      if (requiredToken) {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const supplied = url.searchParams.get('token') || '';
        if (supplied !== requiredToken) {
          socket.close(1008, 'Unauthorized');
          return;
        }
      }
      this.sendToSocket(socket, {
        type: 'connected',
        timestamp: new Date().toISOString(),
      });
    });
  }

  private sendToSocket(socket: WebSocket, msg: WsMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: WsMessage): void {
    const serialized = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  emitProgress(event: Omit<ProgressEvent, 'timestamp'>): void {
    this.broadcast({
      type: 'progress',
      payload: {
        ...event,
        timestamp: new Date().toISOString(),
      },
    });
  }

  watchWorkspace(workspaceDir: string): void {
    const resolved = path.resolve(workspaceDir);
    if (this.watchedWorkspace === resolved && this.watcher) {
      return;
    }

    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }

    this.watchedWorkspace = resolved;
    this.watcher = chokidar.watch(resolved, {
      ignoreInitial: true,
      depth: 4,
      ignored: [
        /(^|[/\\])\.git([/\\]|$)/,
        /(^|[/\\])cache([/\\]|$)/,
        /(^|[/\\])node_modules([/\\]|$)/,
        /\.tmp\./,
      ],
    });

    const handleChange = (event: string, filePath: string) => {
      const rel = path.relative(resolved, filePath).split(path.sep).join('/');
      const segments = rel.split('/');
      if (segments.length < 2) return;
      const projectSlug = segments[0];
      const innerPath = segments.slice(1).join('/');

      const key = `${projectSlug}:${innerPath}`;
      const prev = this.debounceTimers.get(key);
      if (prev) clearTimeout(prev);

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        this.broadcast({
          type: 'file-changed',
          payload: {
            projectSlug,
            relativePath: innerPath,
            event,
            timestamp: new Date().toISOString(),
          },
        });
      }, 250);
      this.debounceTimers.set(key, timer);
    };

    this.watcher
      .on('add', (p) => handleChange('add', p))
      .on('change', (p) => handleChange('change', p))
      .on('unlink', (p) => handleChange('unlink', p));
  }

  async close(): Promise<void> {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
