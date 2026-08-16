import { once } from 'node:events';
import { createServer } from 'node:http';
import { pg } from '@kosmo/core/db';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/post-create-effects';
import { closeFedifyQueue } from '@kosmo/fedify';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createReplyNotificationActivity, sendLocalPostCreateActivity } from './activities';
import { healthStatus, validateWorkerEnvironment } from './worker';

if (import.meta.main) {
  try {
    const { address, namespace, port, host } = validateWorkerEnvironment(process.env);

    let worker: Worker | undefined;
    const server = createServer((request, response) => {
      response.writeHead(healthStatus(request.url, worker?.getState())).end();
    });
    server.listen(port, host);
    await once(server, 'listening');

    const terminateDuringStartup = () => {
      process.off('SIGTERM', terminateDuringStartup);
      queueMicrotask(() => process.kill(process.pid, 'SIGTERM'));
    };
    process.once('SIGTERM', terminateDuringStartup);

    let connection: NativeConnection | undefined;
    try {
      connection = await NativeConnection.connect({ address });
      worker = await Worker.create({
        activities: { createReplyNotificationActivity, sendLocalPostCreateActivity },
        connection,
        namespace,
        taskQueue: KOSMO_TASK_QUEUE,
        workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
      });
      const running = worker.run();
      process.off('SIGTERM', terminateDuringStartup);
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
            await pg.end({ timeout: 5 });
          } finally {
            await server[Symbol.asyncDispose]();
          }
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
