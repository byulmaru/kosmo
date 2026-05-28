import { JobRegistry, smokeJob } from '@kosmo/core/queue';

export const createWorkerRegistry = () => {
  const registry = new JobRegistry();

  registry.registerHandler(smokeJob, (payload, context) => {
    console.log(
      JSON.stringify({
        event: 'job_smoke_success',
        jobId: context.jobId,
        message: payload.message,
      }),
    );
  });

  return registry;
};
