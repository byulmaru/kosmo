import { z } from 'zod';

export const additionalLocalTimelineInstanceIds = (
  process.env.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS ?? ''
)
  .split(',')
  .map((instanceId) => instanceId.trim())
  .filter(Boolean)
  .map((instanceId) => {
    if (!z.uuid().safeParse(instanceId).success) {
      throw new Error('KOSMO_LOCAL_TIMELINE_INSTANCE_IDS configuration must contain only UUIDs');
    }

    return instanceId;
  });
