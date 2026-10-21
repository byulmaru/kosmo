import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

export type StagedObject = {
  contentLength: number | string | null;
  contentType: string | null;
  lastModified: Date | null;
};

type IssuedUpload = {
  authorization: string | undefined;
  body: string;
  id: string;
  uploadUrl: string;
};

export const createStagingR2Fixture = async () => {
  const objects = new Map<string, StagedObject>();
  const issuanceRequests: IssuedUpload[] = [];
  const metadataRequests: { authorization: string | undefined; url: string }[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (request.method === 'POST' && path === '/v1/uploads') {
      let body = '';
      for await (const chunk of request) {
        body += Buffer.from(chunk).toString('utf8');
      }

      const id = `u_${randomUUID()}`;
      const uploadUrl = new URL(`http://${request.headers.host}`);
      uploadUrl.hostname = 'upload.localhost';
      uploadUrl.pathname = `/v1/uploads/${id}`;
      issuanceRequests.push({
        authorization: request.headers.authorization,
        body,
        id,
        uploadUrl: uploadUrl.href,
      });
      response.writeHead(201, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          id,
          uploadUrl: uploadUrl.href,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }),
      );
      return;
    }

    const uploadId = path.match(/^\/v1\/uploads\/(u_[0-9a-f-]+)$/)?.[1];
    if (request.method === 'PUT' && uploadId) {
      let contentLength = 0;
      for await (const chunk of request) {
        contentLength += Buffer.byteLength(chunk);
      }
      const uuid = uploadId.slice(2);
      objects.set(`uploads/${uploadId}/${uuid}`, {
        contentLength,
        contentType:
          typeof request.headers['content-type'] === 'string'
            ? request.headers['content-type']
            : null,
        lastModified: new Date(),
      });
      response
        .writeHead(201, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ id: uploadId }));
      return;
    }

    if (request.method === 'HEAD' && uploadId) {
      metadataRequests.push({
        authorization: request.headers.authorization,
        url: request.url ?? '',
      });
      if (request.headers.authorization !== 'Bearer secret') {
        response.writeHead(401).end();
        return;
      }
      if (url.searchParams.get('staging') !== 'true') {
        response.writeHead(405).end();
        return;
      }

      const uuid = uploadId.slice(2);
      const object = objects.get(`uploads/${uploadId}/${uuid}`);
      if (!object) {
        response.writeHead(404).end();
        return;
      }

      const contentLength = object.contentLength;
      response
        .writeHead(200, {
          ...(object.contentType ? { 'Content-Type': object.contentType } : {}),
          ...(contentLength === null ? {} : { 'Content-Length': String(contentLength) }),
          ...(object.lastModified ? { 'Last-Modified': object.lastModified.toUTCString() } : {}),
        })
        .end();
      return;
    }

    response.writeHead(405).end();
  });
  server.listen(0, '::');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Staging R2 fixture failed to bind');
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    issuanceRequests,
    metadataRequests,
    objects,
    close: async () => {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeAllConnections();
      await closed;
    },
    reset: () => {
      objects.clear();
      issuanceRequests.length = 0;
      metadataRequests.length = 0;
    },
  };
};
