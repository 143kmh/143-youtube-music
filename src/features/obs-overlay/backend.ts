import { createServer } from 'node:http';

import { createBackend } from '@/utils';

import { obsOverlayPage } from './overlay-page';

import type { Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ObsOverlayState } from './types';

const HOST = '127.0.0.1';
const PREFERRED_PORT = 14321;
const PORT_ATTEMPTS = 10;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const DEFAULT_ACCENT = '#60519B';

const emptyState = (): ObsOverlayState => ({
  id: '',
  title: '',
  artist: '',
  album: '',
  artwork: '',
  playing: false,
  time: 0,
  duration: 0,
  updatedAt: Date.now(),
  accent: DEFAULT_ACCENT,
  useAccentColor: false,
  hideWhenPaused: true,
});

const cleanText = (value: unknown, maxLength = 240) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const cleanNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const cleanArtwork = (value: unknown) => {
  const artwork = cleanText(value, 2048);
  return /^https:\/\//iu.test(artwork) ? artwork : '';
};

const cleanAccent = (value: unknown) => {
  const accent = cleanText(value, 7).toUpperCase();
  return /^#[\dA-F]{6}$/u.test(accent) ? accent : DEFAULT_ACCENT;
};

const sanitizeState = (value: unknown): ObsOverlayState => {
  const input =
    value && typeof value === 'object'
      ? (value as Partial<ObsOverlayState>)
      : {};

  return {
    id: cleanText(input.id, 128),
    title: cleanText(input.title),
    artist: cleanText(input.artist),
    album: cleanText(input.album),
    artwork: cleanArtwork(input.artwork),
    playing: input.playing === true,
    time: cleanNumber(input.time),
    duration: cleanNumber(input.duration),
    updatedAt: Date.now(),
    accent: cleanAccent(input.accent),
    useAccentColor: input.useAccentColor === true,
    hideWhenPaused: input.hideWhenPaused !== false,
  };
};

type ObsOverlayBackendState = {
  server: Server | null;
  clients: Set<ServerResponse>;
  state: ObsOverlayState;
  url: string;
  broadcast: () => void;
};

export default createBackend<ObsOverlayBackendState>({
  server: null,
  clients: new Set<ServerResponse>(),
  state: emptyState(),
  url: `http://${HOST}:${PREFERRED_PORT}/overlay`,

  broadcast() {
    const payload = `data: ${JSON.stringify(this.state)}\n\n`;
    for (const client of [...this.clients]) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
        client.end();
      }
    }
  },

  async start({ ipc }) {
    this.state = emptyState();
    this.clients.clear();

    const createOverlayServer = () =>
      createServer(async (request, response) => {
        const requestUrl = new URL(
          request.url ?? '/',
          `http://${request.headers.host ?? `${HOST}:${PREFERRED_PORT}`}`,
        );

        if (requestUrl.pathname === '/' || requestUrl.pathname === '/overlay') {
          response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Security-Policy':
              "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(obsOverlayPage);
          return;
        }

        if (requestUrl.pathname === '/artwork') {
          const artwork = this.state.artwork;
          if (!artwork) {
            response.writeHead(404, {
              'Cache-Control': 'no-store',
              'Content-Type': 'text/plain; charset=utf-8',
            });
            response.end('No artwork');
            return;
          }

          try {
            const remote = await fetch(artwork, {
              redirect: 'follow',
              signal: AbortSignal.timeout(8000),
              headers: {
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36',
              },
            });
            if (!remote.ok) throw new Error(`Artwork HTTP ${remote.status}`);

            const contentType = remote.headers.get('content-type') ?? '';
            if (!contentType.toLowerCase().startsWith('image/'))
              throw new Error('Artwork response was not an image');

            const declaredLength = Number(remote.headers.get('content-length') ?? 0);
            if (declaredLength > MAX_ARTWORK_BYTES)
              throw new Error('Artwork response too large');

            const body = Buffer.from(await remote.arrayBuffer());
            if (body.byteLength > MAX_ARTWORK_BYTES)
              throw new Error('Artwork response too large');

            response.writeHead(200, {
              'Cache-Control': 'no-store',
              'Content-Type': contentType,
              'Content-Length': body.byteLength,
              'X-Content-Type-Options': 'nosniff',
            });
            response.end(body);
          } catch {
            response.writeHead(502, {
              'Cache-Control': 'no-store',
              'Content-Type': 'text/plain; charset=utf-8',
            });
            response.end('Could not load artwork');
          }
          return;
        }

        if (requestUrl.pathname === '/state') {
          response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(JSON.stringify(this.state));
          return;
        }

        if (requestUrl.pathname === '/events') {
          response.writeHead(200, {
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'X-Accel-Buffering': 'no',
          });
          response.write(`data: ${JSON.stringify(this.state)}\n\n`);
          this.clients.add(response);
          request.once('close', () => {
            this.clients.delete(response);
          });
          return;
        }

        if (requestUrl.pathname === '/health') {
          response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
          });
          response.end('143 Music OBS overlay is running');
          return;
        }

        response.writeHead(404, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Not found');
      });

    const listenAt = async (port: number) => {
      const server = createOverlayServer();
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, HOST);
      });
      return server;
    };

    let server: Server | null = null;
    let lastError: unknown = null;
    for (let offset = 0; offset < PORT_ATTEMPTS; offset++) {
      try {
        server = await listenAt(PREFERRED_PORT + offset);
        break;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code !== 'EADDRINUSE') throw error;
      }
    }

    if (!server) {
      try {
        server = await listenAt(0);
      } catch (error) {
        throw lastError ?? error;
      }
    }

    this.server = server;
    const address = server.address() as AddressInfo | null;
    const port = address?.port ?? PREFERRED_PORT;
    this.url = `http://${HOST}:${port}/overlay`;

    ipc.handle('obs-overlay:update', (value: unknown) => {
      this.state = sanitizeState(value);
      this.broadcast();
      return true;
    });

    ipc.handle('obs-overlay:get-url', () => this.url);

    console.log('[143 Music] OBS overlay available at', this.url);
  },

  async stop({ ipc }) {
    ipc.removeHandler('obs-overlay:update');
    ipc.removeHandler('obs-overlay:get-url');

    for (const client of this.clients) client.end();
    this.clients.clear();
    this.state = emptyState();

    const server = this.server;
    this.server = null;
    if (!server) return;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  },
});
