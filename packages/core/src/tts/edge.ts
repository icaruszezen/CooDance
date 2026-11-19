import crypto from 'node:crypto';
import WebSocket from 'ws';
import type { TtsSynthesisOutput } from './doubao.js';

const EDGE_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Lightweight Microsoft Edge Read-Aloud WebSocket TTS client.
 * Requires outbound internet access to speech.platform.bing.com.
 */
export async function synthesizeWithEdgeTts(
  text: string,
  voice = 'zh-CN-XiaoxiaoNeural',
  speedRatio = 1.0,
  timeoutMs = 12000,
): Promise<TtsSynthesisOutput> {
  const connectionId = crypto.randomBytes(16).toString('hex');
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}&ConnectionId=${connectionId}`;
  const ratePct = Math.round((speedRatio - 1) * 100);
  const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;

  return new Promise<TtsSynthesisOutput>((resolve, reject) => {
    const audioParts: Buffer[] = [];
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Edge TTS WebSocket timed out'));
    }, timeoutMs);

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });

    ws.on('open', () => {
      const configMsg =
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        });
      ws.send(configMsg);

      const reqId = crypto.randomBytes(16).toString('hex');
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
        `<voice name='${voice}'><prosody pitch='+0Hz' rate='${rateStr}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
      const ssmlMsg =
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        const header = buf.subarray(2, 2 + headerLen).toString('utf8');
        if (header.includes('Path:audio')) {
          audioParts.push(buf.subarray(2 + headerLen));
        }
      } else {
        const msg = data.toString();
        if (msg.includes('Path:turn.end')) {
          clearTimeout(timer);
          ws.close();
          if (audioParts.length === 0) {
            reject(new Error('Edge TTS returned empty audio stream'));
          } else {
            resolve({
              audioBuffer: Buffer.concat(audioParts),
              extension: 'mp3',
            });
          }
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
