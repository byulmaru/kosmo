import { once } from 'node:events';
import { createServer } from 'node:http';
import { pg, pgRead } from '@kosmo/core/db';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { closeFedifyMetrics, closeFedifyQueue, startFedifyMetrics } from '@kosmo/fedify';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { mediaUploadServiceHandler } from './nexus/media-upload';
import { runSchedules } from './schedule';
import { healthStatus, validateWorkerEnvironment } from './worker';

if (import.meta.main) {
  try {
    const { address, namespace, port, host } = validateWorkerEnvironment(process.env);
    await startFedifyMetrics();

    let worker: Worker | undefined;
    const server = createServer((request, response) => {
      response.writeHead(healthStatus(request.url, worker?.getState())).end();
    });
    server.listen(port, host);
    await once(server, 'listening');
    const listeningAddress = server.address();
    if (listeningAddress === null || typeof listeningAddress === 'string') {
      throw new Error('Unable to determine the Worker health port.');
    }
    process.send?.(listeningAddress.port);

    const terminateDuringStartup = () => {
      process.off('SIGTERM', terminateDuringStartup);
      queueMicrotask(() => process.kill(process.pid, 'SIGTERM'));
    };
    process.once('SIGTERM', terminateDuringStartup);

    let connection: NativeConnection | undefined;
    try {
      connection = await NativeConnection.connect({ address });
      worker = await Worker.create({
        activities,
        connection,
        nexusServices: [mediaUploadServiceHandler],
        namespace,
        taskQueue: KOSMO_TASK_QUEUE,
        workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
      });
      const running = worker.run();
      process.off('SIGTERM', terminateDuringStartup);
      void runSchedules(connection, namespace, process.env.ENVIRONMENT)
        .then((schedules) => {
          console.log(JSON.stringify({ event: 'temporal_schedules_registered', schedules }));
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              event: 'temporal_schedules_registration_failed',
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
      await running;
    } finally {
      process.off('SIGTERM', terminateDuringStartup);
      try {
        await connection?.close();
      } finally {
        try {
          await closeFedifyQueue();
        } finally {
          try {
            await Promise.all([pg.end({ timeout: 5 }), pgRead?.end({ timeout: 5 })]);
          } finally {
            await server[Symbol.asyncDispose]();
          }
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    try {
      await closeFedifyMetrics();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
