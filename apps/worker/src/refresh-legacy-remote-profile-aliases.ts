import '@kosmo/core/polyfill';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityPubActors, db, Instances, pg, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';

export const DEFAULT_BATCH_SIZE = 25;
export const MAX_BATCH_SIZE = 100;
export const LEGACY_PROFILE_URL_CUTOFF = Temporal.Instant.from('2026-09-11T00:00:00Z');

type RemoteProfileAliasCandidate = {
  readonly actorUri: string;
};

type CandidatePage = {
  readonly candidates: readonly RemoteProfileAliasCandidate[];
  readonly nextCursor?: string;
  readonly ttlCutoff: Temporal.Instant;
};

type RefreshOptions = {
  readonly afterActorUri?: string;
  readonly execute: boolean;
  readonly help: boolean;
  readonly limit: number;
};

type FindPageOptions = {
  readonly afterActorUri?: string;
  readonly limit: number;
  readonly now: Temporal.Instant;
};

let closeTemporalClient: (() => Promise<void>) | undefined;

function getRefreshTtlCutoff(now: Temporal.Instant): Temporal.Instant {
  return now.subtract({ hours: 7 * 24 });
}

export function parseRefreshOptions(args: readonly string[]): RefreshOptions {
  let execute = false;
  let help = false;
  let limit = DEFAULT_BATCH_SIZE;
  let afterActorUri: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (index === 0 && argument === '--') {
      continue;
    } else if (argument === '--execute') {
      execute = true;
    } else if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--limit') {
      const value = args[index + 1];
      if (!value || !/^\d+$/.test(value)) {
        throw new Error('--limit must be an integer between 1 and 100.');
      }
      limit = Number(value);
      index += 1;
    } else if (argument === '--after') {
      const value = args[index + 1];
      if (!value?.trim()) {
        throw new Error('--after requires an actor URI cursor.');
      }
      afterActorUri = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_BATCH_SIZE}.`);
  }

  return {
    ...(afterActorUri === undefined ? {} : { afterActorUri }),
    execute,
    help,
    limit,
  };
}

export async function findLegacyRemoteProfileAliasPage({
  afterActorUri,
  limit,
  now,
}: FindPageOptions): Promise<CandidatePage> {
  const ttlCutoff = getRefreshTtlCutoff(now);
  const conditions = [
    eq(Profiles.state, ProfileState.ACTIVE),
    eq(Instances.kind, InstanceKind.ACTIVITYPUB),
    eq(Instances.state, InstanceState.ACTIVE),
    isNull(ActivityPubActors.profileUrl),
    isNotNull(ActivityPubActors.lastFetchedAt),
    lte(ActivityPubActors.lastFetchedAt, ttlCutoff),
    lt(ActivityPubActors.lastFetchedAt, LEGACY_PROFILE_URL_CUTOFF),
    ...(afterActorUri === undefined
      ? []
      : [sql`${ActivityPubActors.uri} COLLATE "C" > ${afterActorUri}`]),
  ];
  const candidates = await db
    .select({ actorUri: ActivityPubActors.uri })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(...conditions))
    .orderBy(sql`${ActivityPubActors.uri} COLLATE "C"`)
    .limit(limit);

  return {
    candidates,
    ...(candidates.length === limit ? { nextCursor: candidates.at(-1)?.actorUri } : {}),
    ttlCutoff,
  };
}

function formatRefreshPlan(
  page: CandidatePage,
  { execute, limit }: Pick<RefreshOptions, 'execute' | 'limit'>,
): string {
  const lines = [
    `Mode: ${execute ? 'execute' : 'dry-run'}`,
    `Selected ${page.candidates.length} actor(s), limit ${limit}.`,
    `Eligibility: ACTIVE ActivityPub actors with NULL profile_url and last_fetched_at at or before ${page.ttlCutoff.toString()} and before ${LEGACY_PROFILE_URL_CUTOFF.toString()}.`,
  ];

  if (page.candidates.length > 0) {
    lines.push('Actors:');
    lines.push(...page.candidates.map(({ actorUri }) => `  ${actorUri}`));
  }

  if (page.nextCursor) {
    lines.push(`Resume cursor: ${page.nextCursor}`);
  }

  if (!execute) {
    lines.push(
      'No Workflows started. Re-run with --execute to start the listed refresh Workflows.',
    );
  }

  return lines.join('\n');
}

async function startRemoteProfileRefresh(actorUri: string): Promise<string> {
  const [{ runWorkflow, temporalClient }, { remoteProfileRefreshWorkflow }] = await Promise.all([
    import('@kosmo/core/temporal/client'),
    import('@kosmo/core/temporal/workflows'),
  ]);
  closeTemporalClient = () => temporalClient.connection.close();
  const workflow = await runWorkflow(remoteProfileRefreshWorkflow, {
    args: [{ actorUri }],
    mode: 'start',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });

  return workflow.workflowId;
}

export async function runRefreshCommand(
  options: RefreshOptions,
  now = Temporal.Now.instant(),
): Promise<CandidatePage> {
  const page = await findLegacyRemoteProfileAliasPage({
    ...(options.afterActorUri === undefined ? {} : { afterActorUri: options.afterActorUri }),
    limit: options.limit,
    now,
  });
  console.log(formatRefreshPlan(page, options));

  if (options.execute) {
    for (const { actorUri } of page.candidates) {
      const workflowId = await startRemoteProfileRefresh(actorUri);
      console.log(`Started or reused Workflow ${workflowId} for ${actorUri}`);
    }
    console.log(`Acknowledged ${page.candidates.length} refresh Workflow start(s).`);
  }

  return page;
}

function printUsage(): void {
  console.log(`Usage: pnpm ops:refresh-legacy-remote-profile-aliases [--limit <1-${MAX_BATCH_SIZE}>] [--after <actor-uri>] [--execute]

Defaults to a dry-run plan. --execute starts the existing remote profile refresh Workflow for each selected actor.`);
}

async function runCommand(args: readonly string[]): Promise<void> {
  const options = parseRefreshOptions(args);

  try {
    if (options.help) {
      printUsage();
      return;
    }

    await runRefreshCommand(options);
  } finally {
    await closeTemporalClient?.();
    await pg.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
