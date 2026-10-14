import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db, Instances, Media, PostContents, PostMentions, Posts, Profiles } from '@kosmo/core/db';
import { MediaState } from '@kosmo/core/enums';
import { decodeGlobalId, encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { visiblePostWhere, visibleProfileWhere } from '@kosmo/core/visibility';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { captureUnexpectedError } from '../sentry';

const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const SHARE_METADATA_START = '<!-- kosmo-share-metadata:start -->';
const SHARE_METADATA_END = '<!-- kosmo-share-metadata:end -->';
const DEFAULT_DESCRIPTION = '흩어진 타임라인을 한곳에서.';
const EMPTY_POST_DESCRIPTION = 'KOSMO에서 이 게시글을 확인해 보세요.';

type ShareImage = {
  readonly altText?: string;
  readonly height?: number;
  readonly mediaType?: string;
  readonly url: string;
  readonly width?: number;
};

type ShareMetadata = {
  readonly canonicalUrl: string;
  readonly description: string;
  readonly images: readonly ShareImage[];
  readonly title: string;
  readonly type: 'article' | 'website';
};

const shareRoutes = new Hono();

shareRoutes.on(['GET', 'HEAD'], '/:relativeHandle/:globalId', async (c, next) => {
  if (!acceptsHtmlPreview(c.req.header('accept'))) {
    return next();
  }

  let decodedGlobalId: ReturnType<typeof decodeGlobalId>;
  try {
    decodedGlobalId = decodeGlobalId(c.req.param('globalId'));
  } catch {
    return next();
  }
  if (decodedGlobalId.typename !== 'Post') {
    return next();
  }

  const origin = parsePublicOrigin(process.env.PUBLIC_ORIGIN);
  if (!origin) {
    return next();
  }

  let appShell: string;
  try {
    appShell = await readFile(resolve(STATIC_ROOT, 'index.html'), 'utf8');
  } catch {
    return next();
  }

  const genericMetadata = createDefaultMetadata(origin);
  let metadata = genericMetadata;
  try {
    const configuredLocalInstance = await resolveConfiguredLocalInstance({ publicOrigin: origin });
    const target = await findShareTarget(decodedGlobalId.id);
    if (target) {
      metadata = await createPostMetadata(target, configuredLocalInstance.id, origin);
    }
  } catch (cause) {
    captureUnexpectedError(cause);
  }

  const html = replaceShareMetadata(appShell, renderMetadata(metadata));
  if (!html) {
    return next();
  }

  return new Response(c.req.method === 'HEAD' ? null : html, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=UTF-8',
      Vary: 'Accept',
    },
    status: 200,
  });
});

type ShareTargetRow = {
  readonly authorDisplayName: string;
  readonly authorHandle: string;
  readonly authorInstanceId: string;
  readonly authorInstanceJoinedId: string;
  readonly authorInstanceDomain: string;
  readonly contentDocument: (typeof PostContents.$inferSelect)['document'] | null;
  readonly currentContentId: string | null;
  readonly postId: string;
  readonly replyParentId: string | null;
  readonly repostSourceId: string | null;
};

async function findVisibleContentPost(postId: string): Promise<ShareTargetRow | null> {
  const row = await findVisiblePost(postId, true);
  return row?.contentDocument ? row : null;
}

async function findVisiblePost(
  postId: string,
  requireContent = false,
): Promise<ShareTargetRow | null> {
  const rows = await db
    .select({
      authorDisplayName: Profiles.displayName,
      authorHandle: Profiles.handle,
      authorInstanceDomain: Instances.domain,
      authorInstanceId: Profiles.instanceId,
      authorInstanceJoinedId: Instances.id,
      contentDocument: PostContents.document,
      currentContentId: Posts.currentContentId,
      postId: Posts.id,
      replyParentId: Posts.replyParentId,
      repostSourceId: Posts.repostSourceId,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      PostContents,
      and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
    )
    .where(
      and(
        eq(Posts.id, postId),
        requireContent ? isNotNull(Posts.currentContentId) : undefined,
        visiblePostWhere({
          db,
          post: Posts,
          profileVisible: sql<boolean>`${visibleProfileWhere({
            profile: Profiles,
            instance: Instances,
          })}`,
          viewerProfileId: null,
        }),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function findShareTarget(postId: string): Promise<ShareTargetRow | null> {
  const post = await findVisiblePost(postId);
  if (!post) {
    return null;
  }
  if (post.currentContentId && post.contentDocument) {
    return post;
  }

  if (post.currentContentId || post.replyParentId || !post.repostSourceId) {
    return null;
  }

  return findVisibleContentPost(post.repostSourceId);
}

async function createPostMetadata(
  target: ShareTargetRow,
  configuredLocalInstanceId: string,
  origin: string,
): Promise<ShareMetadata> {
  const document = target.contentDocument;
  if (!document || target.authorInstanceId !== target.authorInstanceJoinedId) {
    return createDefaultMetadata(origin);
  }

  const relativeHandle = formatRelativeHandle(target, configuredLocalInstanceId);
  let mentionHandles: ReadonlyMap<string, string> = new Map();
  try {
    mentionHandles = await findVisibleMentionHandles(
      document,
      target.currentContentId!,
      configuredLocalInstanceId,
    );
  } catch (cause) {
    captureUnexpectedError(cause);
  }

  const body = postContentDocumentToText(document, mentionHandles);
  const isSensitive = Boolean(document.body.attrs?.sensitiveMedia);
  const description =
    document.summary !== null ? `콘텐츠 경고: ${document.summary}` : body || EMPTY_POST_DESCRIPTION;
  let images: readonly ShareImage[] = [defaultImage(origin)];

  if (document.summary === null && !isSensitive) {
    try {
      const visibleImages = await findVisibleImages(document, origin);
      if (visibleImages.length > 0) {
        images = visibleImages;
      }
    } catch (cause) {
      captureUnexpectedError(cause);
    }
  }

  const title = `${target.authorDisplayName.trim() || relativeHandle} (${relativeHandle}) · KOSMO`;
  const canonicalHandle = encodeURIComponent(relativeHandle).replace(/%40/gi, '@');
  const canonicalId = encodeURIComponent(encodeGlobalId('Post', target.postId));

  return {
    canonicalUrl: new URL(`${canonicalHandle}/${canonicalId}`, `${origin}/`).toString(),
    description,
    images,
    title,
    type: 'article',
  };
}

async function findVisibleMentionHandles(
  document: (typeof PostContents.$inferSelect)['document'],
  contentId: string,
  configuredLocalInstanceId: string,
): Promise<ReadonlyMap<string, string>> {
  const mentionIds = new Set(
    document.body.content.flatMap((block) =>
      block.type === 'paragraph'
        ? (block.content ?? [])
            .filter((node) => node.type === 'mention')
            .map((node) => node.attrs.profileId)
        : [],
    ),
  );
  if (mentionIds.size === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      domain: Instances.domain,
      instanceId: Profiles.instanceId,
      profileId: Profiles.id,
      handle: Profiles.handle,
      joinedInstanceId: Instances.id,
    })
    .from(PostMentions)
    .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(PostMentions.postContentId, contentId),
        inArray(PostMentions.profileId, [...mentionIds]),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    );

  return new Map(
    rows.flatMap((row) => {
      if (row.instanceId !== row.joinedInstanceId) {
        return [];
      }
      const handle =
        row.instanceId === configuredLocalInstanceId
          ? `@${row.handle}`
          : `@${row.handle}@${row.domain}`;
      return [[row.profileId, handle] as const];
    }),
  );
}

async function findVisibleImages(
  document: (typeof PostContents.$inferSelect)['document'],
  origin: string,
): Promise<readonly ShareImage[]> {
  const mediaIds = document.body.content.flatMap((block) =>
    block.type === 'media' ? [block.attrs.mediaId] : [],
  );
  if (mediaIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      altText: Media.altText,
      id: Media.id,
      mediaType: Media.mediaType,
      state: Media.state,
      url: Media.url,
    })
    .from(Media)
    .where(inArray(Media.id, [...new Set(mediaIds)]));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const images: ShareImage[] = [];

  for (const mediaId of mediaIds) {
    const media = rowsById.get(mediaId);
    const url = media?.url ? parsePublicImageUrl(media.url) : null;
    const mediaType = parseImageMediaType(media?.mediaType ?? null);
    if (!media || media.state !== MediaState.READY || !url || (media.mediaType && !mediaType)) {
      return [];
    }

    images.push({
      ...(media.altText !== null ? { altText: media.altText } : {}),
      ...(mediaType ? { mediaType } : {}),
      url,
    });
  }

  return images.length ? images : [defaultImage(origin)];
}

function formatRelativeHandle(
  target: Pick<ShareTargetRow, 'authorHandle' | 'authorInstanceDomain' | 'authorInstanceId'>,
  configuredLocalInstanceId: string,
): string {
  return target.authorInstanceId === configuredLocalInstanceId
    ? `@${target.authorHandle}`
    : `@${target.authorHandle}@${target.authorInstanceDomain}`;
}

function parsePublicOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parsePublicImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function parseImageMediaType(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const essence = value.split(';', 1)[0]?.trim();
  return essence && /^image\/[a-z0-9!#$&^_.+-]+$/i.test(essence) ? essence.toLowerCase() : null;
}

function createDefaultMetadata(origin: string): ShareMetadata {
  return {
    canonicalUrl: new URL('/', `${origin}/`).toString(),
    description: DEFAULT_DESCRIPTION,
    images: [defaultImage(origin)],
    title: 'KOSMO',
    type: 'website',
  };
}

function defaultImage(origin: string): ShareImage {
  return {
    altText: 'KOSMO 로고',
    height: 630,
    mediaType: 'image/png',
    url: new URL('/og-default.png', `${origin}/`).toString(),
    width: 1200,
  };
}

function renderMetadata(metadata: ShareMetadata): string {
  const firstImage = metadata.images[0] ?? defaultImage('https://kos.moe');
  const imageTags = metadata.images.flatMap((image) => [
    metaTag('property', 'og:image', image.url),
    ...(image.mediaType ? [metaTag('property', 'og:image:type', image.mediaType)] : []),
    ...(image.width ? [metaTag('property', 'og:image:width', String(image.width))] : []),
    ...(image.height ? [metaTag('property', 'og:image:height', String(image.height))] : []),
    ...(image.altText !== undefined ? [metaTag('property', 'og:image:alt', image.altText)] : []),
  ]);

  return [
    `<title>${escapeHtml(metadata.title)}</title>`,
    metaTag('name', 'description', metadata.description),
    metaTag('property', 'og:type', metadata.type),
    metaTag('property', 'og:url', metadata.canonicalUrl),
    metaTag('property', 'og:site_name', 'KOSMO'),
    metaTag('property', 'og:title', metadata.title),
    metaTag('property', 'og:description', metadata.description),
    ...imageTags,
    metaTag('name', 'twitter:card', 'summary_large_image'),
    metaTag('name', 'twitter:title', metadata.title),
    metaTag('name', 'twitter:description', metadata.description),
    metaTag('name', 'twitter:image', firstImage.url),
    ...(firstImage.altText !== undefined
      ? [metaTag('name', 'twitter:image:alt', firstImage.altText)]
      : []),
  ].join('\n    ');
}

function metaTag(attribute: 'name' | 'property', key: string, value: string): string {
  return `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(value)}" />`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceShareMetadata(html: string, metadata: string): string | null {
  const start = html.indexOf(SHARE_METADATA_START);
  const end = html.indexOf(SHARE_METADATA_END);
  if (
    start < 0 ||
    end < start ||
    start !== html.lastIndexOf(SHARE_METADATA_START) ||
    end !== html.lastIndexOf(SHARE_METADATA_END)
  ) {
    return null;
  }

  const contentStart = start + SHARE_METADATA_START.length;
  return `${html.slice(0, contentStart)}\n    ${metadata}\n    ${html.slice(end)}`;
}

function acceptsHtmlPreview(accept: string | undefined): boolean {
  if (!accept || accept.trim() === '*/*') {
    return true;
  }

  const ranges = accept.split(',').flatMap((entry) => {
    const [mediaType, ...parameters] = entry.trim().split(';');
    if (!mediaType) {
      return [];
    }
    const qualityParameter = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
    const quality = qualityParameter ? Number(qualityParameter.split('=')[1]) : 1;
    return Number.isFinite(quality) && quality >= 0 && quality <= 1
      ? [{ mediaType: mediaType.trim().toLowerCase(), quality }]
      : [];
  });
  if (
    ranges.some(
      ({ mediaType, quality }) =>
        quality > 0 &&
        (mediaType === 'application/activity+json' || mediaType === 'application/ld+json'),
    )
  ) {
    return false;
  }

  const htmlRanges = ranges.flatMap(({ mediaType, quality }) => {
    const specificity =
      mediaType === 'text/html' ? 2 : mediaType === 'text/*' ? 1 : mediaType === '*/*' ? 0 : -1;
    return specificity >= 0 ? [{ quality, specificity }] : [];
  });
  const mostSpecific = Math.max(-1, ...htmlRanges.map(({ specificity }) => specificity));
  return (
    mostSpecific >= 0 &&
    htmlRanges.some(({ quality, specificity }) => specificity === mostSpecific && quality > 0)
  );
}

export default shareRoutes;
