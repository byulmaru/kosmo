import { once } from 'node:events';
import { createServer } from 'node:http';

export type StagedObject = {
  contentLength: number;
  contentType: string | null;
  lastModified: Date | null;
};

export const createStagingR2Fixture = async () => {
  const objects = new Map<string, StagedObject>();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const [, , ...keySegments] = path.split('/');
    const key = keySegments.join('/');

    if (request.method === 'PUT') {
      let contentLength = 0;
      for await (const chunk of request) {
        contentLength += Buffer.byteLength(chunk);
      }
      objects.set(key, {
        contentLength,
        contentType: request.headers['content-type'] ?? null,
        lastModified: new Date(),
      });
      response.writeHead(200).end();
      return;
    }

    if (request.method === 'HEAD') {
      const object = objects.get(key);
      if (!object) {
        response.writeHead(404).end();
        return;
      }

      response
        .writeHead(200, {
          ...(object.contentType ? { 'Content-Type': object.contentType } : {}),
          'Content-Length': object.contentLength,
          ...(object.lastModified ? { 'Last-Modified': object.lastModified.toUTCString() } : {}),
        })
        .end();
      return;
    }

    response.writeHead(405).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Staging R2 fixture failed to bind');
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    close: async () => {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeAllConnections();
      await closed;
    },
    reset: () => objects.clear(),
  };
};
