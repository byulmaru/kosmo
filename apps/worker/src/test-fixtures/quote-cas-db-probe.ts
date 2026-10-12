import '@kosmo/core/polyfill';

import { setTimeout as delay } from 'node:timers/promises';
import { db, pg, Posts } from '@kosmo/core/db';
import { NativeConnection, Worker } from '@temporalio/worker';
import { eq, sql } from 'drizzle-orm';

// Separate process so an actual backend-disconnect/Worker crash cannot kill the suite.
const [mode, postId, address, namespace, taskQueue] = process.argv.slice(2);
if (!postId) {
  throw new Error('Post ID required');
}
if (mode === 'idle') {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '400ms'`);
      await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)).for('update');
      process.send?.('locked');
      await delay(650);
      await tx.update(Posts).set({ quoteConsentStatus: 'APPROVED' }).where(eq(Posts.id, postId));
    });
  } catch (error) {
    process.send?.({ caught: error instanceof Error ? error.message : String(error) });
  } finally {
    await pg.end();
  }
  // Let the suspended callback resume to distinguish a rejected promise from an uncaught write.
  await delay(900);
} else if (mode === 'crash') {
  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: taskQueue!,
    activities: {
      async writeConsent() {
        return db.transaction(async (tx) => {
          await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)).for('update');
          await tx
            .update(Posts)
            .set({ quoteConsentStatus: 'APPROVED' })
            .where(eq(Posts.id, postId));
          process.send?.('locked');
          await new Promise<void>(() => {});
          return 'never';
        });
      },
    },
  });
  void worker.run();
  process.send?.('ready');
} else {
  throw new Error('Unknown probe mode');
}
