import { NO_WORKER_REGISTRATION_MESSAGE, runWorkerApplication } from './application';
import { workerRegistration } from './registration';

try {
  await runWorkerApplication(workerRegistration);
} catch (error) {
  if (error instanceof Error && error.message === NO_WORKER_REGISTRATION_MESSAGE) {
    console.error(error.message);
  } else {
    console.error('Temporal Worker failed', error);
  }
  process.exitCode = 1;
}
