import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3001);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method !== 'POST' || url.pathname !== '/graphql') {
    response.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      data: {
        __typename: 'Query',
        receivedOperationName: body.operationName,
      },
    }),
  );
});

server.listen(port, '0.0.0.0');

process.on('SIGTERM', () => server.close());
