import { error } from '@sveltejs/kit';
import { instanceIdSchema } from '#lib/server/instances.js';
import {
  getInstanceDomain,
  listProfiles,
  profileIdSchema,
  profileOriginSchema,
  profileStateSchema,
} from '#lib/server/profiles.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawOrigin = url.searchParams.get('origin');
  const rawState = url.searchParams.get('state');
  const rawInstanceId = url.searchParams.get('instanceId');
  const origin = rawOrigin ? profileOriginSchema.safeParse(rawOrigin) : undefined;
  const state = rawState ? profileStateSchema.safeParse(rawState) : undefined;
  const instanceId = rawInstanceId ? instanceIdSchema.safeParse(rawInstanceId) : undefined;

  if (
    (cursor && !profileIdSchema.safeParse(cursor).success) ||
    (direction && direction !== 'previous') ||
    (direction === 'previous' && !cursor) ||
    (rawOrigin && !origin?.success) ||
    (rawState && !state?.success) ||
    (rawInstanceId && !instanceId?.success)
  ) {
    error(404, 'Not Found');
  }

  const selectedOrigin = origin?.success ? origin.data : undefined;
  const selectedState = state?.success ? state.data : undefined;
  const selectedInstanceId = instanceId?.success ? instanceId.data : undefined;
  const instanceDomain = selectedInstanceId
    ? await getInstanceDomain(selectedInstanceId)
    : undefined;

  if (selectedInstanceId && !instanceDomain) {
    error(404, 'Not Found');
  }

  const page = await listProfiles({
    cursor: cursor ?? undefined,
    direction: direction === 'previous' ? 'previous' : 'next',
    instanceId: selectedInstanceId,
    q: q || undefined,
    origin: selectedOrigin,
    state: selectedState,
  });

  return {
    ...page,
    instanceDomain: instanceDomain ?? null,
    filters: {
      q,
      origin: selectedOrigin ?? '',
      state: selectedState ?? '',
      instanceId: selectedInstanceId ?? '',
    },
  };
};
