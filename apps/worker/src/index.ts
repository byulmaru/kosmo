import { once } from 'node:events';
import { createServer } from 'node:http';
import { pg } from '@kosmo/core/db';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { closeFedifyQueue } from '@kosmo/fedify';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { healthStatus, validateWorkerEnvironment } from './worker';
import { getWorkflowRegistration } from './workflow-bundle';

if (import.meta.main) {
  try {
    const { address, namespace, port, host } = validateWorkerEnvironment(process.env);

    let worker: Worker | undefined;
    const server = createServer((request, response) => {
      response.writeHead(healthStatus(request.url, worker?.getState())).end();
    });
    server.listen(port, host);
    await once(server, 'listening');

    let terminatingDuringStartup = false;
    const terminateDuringStartup = () => {
      if (terminatingDuringStartup) {
        return;
      }
      terminatingDuringStartup = true;
      process.off('SIGTERM', terminateDuringStartup);
      void (async () => {
        try {
          await closeFedifyQueue();
          await pg.end({ timeout: 5 });
          await server[Symbol.asyncDispose]();
        } finally {
          // PID 1 does not apply Node's default SIGTERM exit after a listener
          // handles it, so finish the startup-only shutdown explicitly.
          process.exit(0);
        }
      })();
    };
    process.once('SIGTERM', terminateDuringStartup);

    let connection: NativeConnection | undefined;
    try {
      connection = await NativeConnection.connect({ address });
      worker = await Worker.create({
        activities,
        connection,
        namespace,
        taskQueue: KOSMO_TASK_QUEUE,
        ...getWorkflowRegistration(),
      });
      const running = worker.run();
      process.off('SIGTERM', terminateDuringStartup);
      await running;
    } finally {
      process.off('SIGTERM', terminateDuringStartup);
      if (!terminatingDuringStartup) {
        try {
          await connection?.close();
        } finally {
          try {
            await closeFedifyQueue();
          } finally {
            try {
              await pg.end({ timeout: 5 });
            } finally {
              await server[Symbol.asyncDispose]();
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
