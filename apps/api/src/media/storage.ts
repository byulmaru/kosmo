import { z } from 'zod';

const uploadResponseSchema = z.strictObject({
  id: z.string().regex(/^u_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  uploadUrl: z.url(),
  expiresAt: z.string(),
});

const configSchema = z.object({
  MEDIA_STORAGE_SERVICE_ORIGIN: z.url(),
  MEDIA_STORAGE_SERVICE_API_KEY: z.string().min(1),
});

const getConfig = () => {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Media Storage Service is not configured');
  }

  return {
    origin: parsed.data.MEDIA_STORAGE_SERVICE_ORIGIN,
    apiKey: parsed.data.MEDIA_STORAGE_SERVICE_API_KEY,
  };
};

export const issueMediaStorageUpload = async () => {
  const config = getConfig();
  const response = await globalThis.fetch(new URL('/v1/uploads', config.origin), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (response.status !== 201) {
    throw new Error(`Media Storage Service rejected upload issuance (${response.status})`);
  }

  const parsed = uploadResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Media Storage Service returned an invalid upload response');
  }

  let expiresAt: Temporal.Instant;
  try {
    expiresAt = Temporal.Instant.from(parsed.data.expiresAt);
  } catch {
    throw new Error('Media Storage Service returned an invalid upload expiry');
  }

  return {
    storageReference: parsed.data.id,
    uploadUrl: parsed.data.uploadUrl,
    expiresAt,
  };
};
