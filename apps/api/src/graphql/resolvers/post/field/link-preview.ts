import { db, first, LinkPreviews, withPrimaryDatabase } from '@kosmo/core/db';
import { normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { getFirstPostContentLink, readPostContentDocumentV1 } from '@kosmo/core/post-content';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  getLinkPreviewUrlHash,
  linkPreviewRefreshWorkflow,
} from '@kosmo/core/temporal/link-preview';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { reportError } from '@/sentry';
import { PostContent } from '../ref';

const refreshTtl = Temporal.Duration.from({ hours: 168 });
const failureBackoff = Temporal.Duration.from({ minutes: 10 });

const linkPreviewValue = (row: typeof LinkPreviews.$inferSelect | undefined) =>
  row?.title == null
    ? null
    : {
        url: row.url,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
      };

const isWithin = (
  instant: Temporal.Instant | null,
  duration: Temporal.Duration,
  now: Temporal.Instant,
) => instant !== null && instant.add(duration).epochNanoseconds > now.epochNanoseconds;

const PostContentLinkPreview = builder.simpleObject('PostContentLinkPreview', {
  fields: (t) => ({
    url: t.string(),
    title: t.string(),
    description: t.string({ nullable: true }),
    imageUrl: t.string({ nullable: true }),
  }),
});

builder.objectField(PostContent, 'linkPreview', (t) =>
  t.field({
    type: PostContentLinkPreview,
    nullable: true,
    resolve: async (content) => {
      let currentValue: ReturnType<typeof linkPreviewValue> = null;
      try {
        const document = readPostContentDocumentV1(content.document);
        if (document === null || document.body.content.some((block) => block.type === 'media')) {
          return null;
        }

        const firstUrl = getFirstPostContentLink(document);
        if (firstUrl === null) {
          return null;
        }

        const url = normalizeLinkPreviewUrl(firstUrl);
        if (url === null) {
          return null;
        }

        const urlHash = getLinkPreviewUrlHash(url);
        const current = await withPrimaryDatabase(() =>
          db
            .select()
            .from(LinkPreviews)
            .where(eq(LinkPreviews.urlHash, urlHash))
            .limit(1)
            .then(first),
        );
        currentValue = linkPreviewValue(current);
        const now = Temporal.Now.instant();

        if (isWithin(current?.lastSuccessfulFetchAt ?? null, refreshTtl, now)) {
          return currentValue;
        }
        if (isWithin(current?.lastFailureAt ?? null, failureBackoff, now)) {
          return currentValue;
        }

        return (
          (await runWorkflow(linkPreviewRefreshWorkflow, {
            args: [{ url }],
            mode: 'execute',
            workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
          })) ?? currentValue
        );
      } catch (error) {
        reportError(error);
        return currentValue;
      }
    },
  }),
);
