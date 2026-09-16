import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';

import { getOfflineTrack } from './storage';

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const HOST = '127.0.0.1';

type OfflineStreamServer = Readonly<{
  server: Server;
  baseUrl: string;
  urlFor: (id: string) => string;
  stop: () => Promise<void>;
}>;

const parseRange = (value: string | undefined, size: number) => {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) return null;
  if (start < 0 || requestedEnd < start || start >= size) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
};

export const startOfflineStreamServer = async (): Promise<OfflineStreamServer> => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? HOST}`,
      );
      const match = /^\/track\/([^/]+)$/u.exec(url.pathname);
      if (!match || !['GET', 'HEAD'].includes(request.method ?? 'GET')) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const id = decodeURIComponent(match[1]);
      const track = await getOfflineTrack(id);
      if (!track) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Track not found');
        return;
      }

      const info = await stat(track.filePath);
      const size = info.size;
      const range = parseRange(request.headers.range, size);
      const commonHeaders = {
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'private, no-store',
        'Content-Type': track.mimeType,
        'X-Content-Type-Options': 'nosniff',
      };

      if (request.headers.range && !range) {
        response.writeHead(416, {
          ...commonHeaders,
          'Content-Range': `bytes */${size}`,
        });
        response.end();
        return;
      }

      if (range) {
        const length = range.end - range.start + 1;
        response.writeHead(206, {
          ...commonHeaders,
          'Content-Length': length,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        createReadStream(track.filePath, range).pipe(response);
        return;
      }

      response.writeHead(200, {
        ...commonHeaders,
        'Content-Length': size,
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(track.filePath).pipe(response);
    } catch (error) {
      console.warn('[143 Music] Offline stream request failed', error);
      if (!response.headersSent)
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Offline stream failed');
    }
  });

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
    server.listen(0, HOST);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://${HOST}:${address.port}`;
  return {
    server,
    baseUrl,
    urlFor: (id: string) => `${baseUrl}/track/${encodeURIComponent(id)}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
};
