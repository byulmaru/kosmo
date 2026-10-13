import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceKind } from '@kosmo/core/enums';
import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES,
  followingAccountsImportWorkflow,
} from '@kosmo/core/temporal/workflows';
import { profileHandleSchema, remoteProfileHandleSchema } from '@kosmo/core/validation';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import type { FollowingAccountsImportAddress } from '@kosmo/core/temporal/workflows';

const MAX_CSV_BYTES = 512 * 1024;
const HEADER = 'Account address';

const invalidCsv = (message: string): ValidationError =>
  new ValidationError(message, { field: 'csv' });

export const parseFollowingAccountsCsv = (
  csv: string,
  configuredLocalDomain: string,
): readonly FollowingAccountsImportAddress[] => {
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    throw invalidCsv('CSV 파일은 512KiB 이하여야 해요.');
  }

  let rows: readonly Record<string, string | undefined>[];
  try {
    rows = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      columns: (headers: string[]) => {
        if (headers.filter((header) => header === HEADER).length !== 1) {
          throw invalidCsv('CSV에 Account address 열이 하나 있어야 해요.');
        }
        if (new Set(headers).size !== headers.length) {
          throw invalidCsv('CSV 열 이름은 중복될 수 없어요.');
        }
        return headers;
      },
    }) as readonly Record<string, string | undefined>[];
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw invalidCsv('올바른 CSV 파일을 입력해주세요.');
  }

  if (rows.length === 0) {
    throw invalidCsv('CSV에 Account address 열이 있어야 해요.');
  }

  const dataRows = rows.filter((row) =>
    Object.values(row).some((cell) => typeof cell === 'string' && cell.trim() !== ''),
  );
  if (dataRows.length > FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES) {
    throw invalidCsv('CSV에는 최대 10,000개의 계정만 포함할 수 있어요.');
  }

  const byIdentity = new Map<string, FollowingAccountsImportAddress>();
  for (const [index, row] of dataRows.entries()) {
    const rawAddress = row[HEADER]?.trim() ?? '';
    const address = rawAddress.replace(/^@/, '');
    const invalidAddressMessage = `CSV ${index + 1}번째 계정 주소 형식이 올바르지 않아요. 예: user@example.com`;
    const parsed =
      address.split('@').length === 2
        ? parseProfileHandle(address, { configuredLocalDomain })
        : null;
    if (!parsed) {
      throw invalidCsv(invalidAddressMessage);
    }

    if (parsed.kind === 'local') {
      if (!profileHandleSchema.safeParse(parsed.handle).success) {
        throw invalidCsv(invalidAddressMessage);
      }
      const normalized: FollowingAccountsImportAddress = {
        kind: 'local',
        handle: parsed.normalizedHandle,
      };
      const identity = `local:${parsed.normalizedHandle}`;
      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, normalized);
      }
      continue;
    }

    if (
      parsed.handle !== parsed.handle.trim() ||
      !remoteProfileHandleSchema.safeParse(parsed.handle).success
    ) {
      throw invalidCsv(invalidAddressMessage);
    }
    const normalized: FollowingAccountsImportAddress = {
      kind: 'remote',
      handle: parsed.handle,
      domain: parsed.domain,
    };
    const identity = `remote:${parsed.normalizedHandle}@${parsed.domain}`;
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, normalized);
    }
  }

  if (byIdentity.size === 0) {
    throw invalidCsv('가져올 계정 주소가 없어요.');
  }

  return [...byIdentity.values()];
};

builder.mutationField('importFollowingAccounts', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('ImportFollowingAccountsPayload', {
      fields: (field) => ({
        accepted: field.boolean(),
      }),
    }),
    input: {
      csv: t.input.string(),
    },
    resolve: async (_, { input }, ctx) => {
      const localInstance = await resolveConfiguredLocalInstance();
      const selectedProfile = await db
        .select({ instanceKind: Instances.kind })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(eq(Profiles.id, ctx.session.profile.id))
        .limit(1)
        .then(first);
      if (!selectedProfile || selectedProfile.instanceKind !== InstanceKind.LOCAL) {
        throw new PermissionDeniedError('A Local Profile is required');
      }

      const addresses = parseFollowingAccountsCsv(input.csv, localInstance.domain);

      await runWorkflow(followingAccountsImportWorkflow, {
        args: [
          {
            followerProfileId: ctx.session.profile.id,
            addresses,
          },
        ],
        mode: 'start',
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

      return { accepted: true };
    },
  }),
);
