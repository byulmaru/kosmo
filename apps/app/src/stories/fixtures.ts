import { createTipTapDocumentFromPlainText } from '@/lib/tiptap';

export type StoryProfile = {
  __typename: 'Profile';
  bio: string | null;
  displayName: string;
  followers: {
    edges: Array<{
      cursor: string;
      node: { __typename: 'ProfileFollow'; follower: StoryProfile | null; id: string };
    }>;
    pageInfo: StoryPageInfo;
  };
  followersCount: number;
  following: {
    edges: Array<{
      cursor: string;
      node: { __typename: 'ProfileFollow'; followee: StoryProfile | null; id: string };
    }>;
    pageInfo: StoryPageInfo;
  };
  followingCount: number;
  handle: string;
  id: string;
  relativeHandle: string;
  viewerState: { follow: { id: string } | null; isSelf: boolean } | null;
};

type StoryPageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
};

function pageInfo(hasNextPage = false, endCursor: string | null = null): StoryPageInfo {
  return {
    endCursor,
    hasNextPage,
    hasPreviousPage: false,
    startCursor: null,
  };
}

export function profile(overrides: Partial<StoryProfile> = {}): StoryProfile {
  return {
    __typename: 'Profile',
    bio: '우주와 사람을 잇는 코스모 프로필입니다.',
    displayName: '코스모 작가',
    followers: { edges: [], pageInfo: pageInfo() },
    followersCount: 128,
    following: { edges: [], pageInfo: pageInfo() },
    followingCount: 42,
    handle: 'kosmo',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
    viewerState: { follow: null, isSelf: false },
    ...overrides,
  };
}

export type StoryPost = ReturnType<typeof post>;

export function post({
  bodyText = '코스모에서 전하는 첫 번째 소식입니다.',
  createdAt = new Date(Date.now() - 5 * 60_000).toISOString(),
  id = 'post-1',
  profile: author = profile(),
  visibility = 'UNLISTED',
}: {
  bodyText?: string | null;
  createdAt?: string;
  id?: string;
  profile?: StoryProfile;
  visibility?: 'DIRECT' | 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
} = {}) {
  return {
    __typename: 'Post' as const,
    content:
      bodyText === null
        ? null
        : {
            __typename: 'PostContent' as const,
            bodyJson: createTipTapDocumentFromPlainText(bodyText),
            bodyText,
            id: `content-${id}`,
          },
    createdAt,
    id,
    profile: author,
    state: 'ACTIVE',
    visibility,
  };
}

export function timeline(...posts: StoryPost[]) {
  return {
    __typename: 'PostConnection' as const,
    edges: posts.map((node, index) => ({ cursor: `post-cursor-${index}`, node })),
    pageInfo: pageInfo(),
  };
}

export function profileWithPosts(posts: StoryPost[], overrides: Partial<StoryProfile> = {}) {
  return { ...profile(overrides), posts: timeline(...posts) };
}

export function shellQuery({
  profiles = [profile({ viewerState: { follow: null, isSelf: true } })],
  selectedProfile = profiles[0] ?? null,
}: {
  profiles?: StoryProfile[];
  selectedProfile?: StoryProfile | null;
} = {}) {
  return {
    currentSession: { id: 'session-story', selectedProfile },
    me: { id: 'account-story', name: '스토리 계정', profiles },
  };
}

type PaginationMetadata = {
  hasNext?: boolean;
};

export function followersProfile(profiles: StoryProfile[], metadata: PaginationMetadata = {}) {
  return {
    ...profile(),
    followers: {
      edges: profiles.map((follower, index) => ({
        cursor: `follower-cursor-${index}`,
        node: { __typename: 'ProfileFollow' as const, follower, id: `follower-edge-${index}` },
      })),
      pageInfo: pageInfo(
        Boolean(metadata.hasNext),
        profiles.length ? `follower-cursor-${profiles.length - 1}` : null,
      ),
    },
  };
}

export function followingProfile(profiles: StoryProfile[], metadata: PaginationMetadata = {}) {
  return {
    ...profile(),
    following: {
      edges: profiles.map((followee, index) => ({
        cursor: `following-cursor-${index}`,
        node: { __typename: 'ProfileFollow' as const, followee, id: `following-edge-${index}` },
      })),
      pageInfo: pageInfo(
        Boolean(metadata.hasNext),
        profiles.length ? `following-cursor-${profiles.length - 1}` : null,
      ),
    },
  };
}

export const longBody =
  '긴 본문도 목록과 상세 화면에서 같은 TipTap 문서를 사용해 렌더링합니다. '.repeat(8) +
  '\n두 번째 문단의 줄바꿈과 빈 줄도 유지되어야 합니다.\n\n마지막 문단입니다.';
