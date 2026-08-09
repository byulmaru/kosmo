import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface HealthServer {
  close(): Promise<void>;
  readonly port: number;
  setReady(ready: boolean): void;
}

export interface HealthServerOptions {
  host: string;
  port: number;
}

export async function createHealthServer({
  host,
  port,
}: HealthServerOptions): Promise<HealthServer> {
  let live = true;
  let ready = false;

  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(live ? 200 : 503).end();
      return;
    }

    if (request.url === '/ready') {
      response.writeHead(live && ready ? 200 : 503).end();
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });

  return {
    async close() {
      live = false;
      ready = false;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    port: (server.address() as AddressInfo).port,
    setReady(value) {
      ready = value;
    },
  };
}
