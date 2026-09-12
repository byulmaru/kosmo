import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { normalizeProfileHandle } from '@/components/profile/route';
import {
  consumeReactionPeopleReturnToOrigin,
  getReactionPeopleHref,
  hasReactionPeopleReturnToOrigin,
  resolveReactionPeopleType,
  restoreReactionPeopleReturnFocus,
} from '@/components/reaction/reactionPeopleRoute';
import {
  ReactionPeopleHeader,
  ReactionPeopleScreen,
} from '@/components/reaction/ReactionPeopleScreen';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ReactionPeopleRouteQuery } from './__generated__/ReactionPeopleRouteQuery.graphql';

const reactionPeopleRouteQuery = graphql`
  query ReactionPeopleRouteQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        state
        profile {
          relativeHandle
        }
        content {
          id
        }
        replyParent {
          id
        }
        repostSource {
          id
          profile {
            relativeHandle
          }
        }
        reactionCounts {
          type
          count
        }
      }
    }
  }
`;

export default function ReactionPeopleRoute() {
  const params = useLocalSearchParams<{
    postId?: string | string[];
    profileHandle?: string | string[];
    type?: string | string[];
  }>();
  const router = useRouter();
  const postId = firstParam(params.postId);
  const rawProfileHandle = firstParam(params.profileHandle);
  const handle = normalizeProfileHandle(rawProfileHandle);
  const routeRelativeHandle = rawProfileHandle.startsWith('@')
    ? rawProfileHandle
    : `@${rawProfileHandle}`;
  const fallbackPostHref = `/${routeRelativeHandle}/${postId}` as Href;
  const onBack = useCallback(() => {
    const returnToOrigin = hasReactionPeopleReturnToOrigin();
    consumeReactionPeopleReturnToOrigin();
    if (returnToOrigin && router.canGoBack()) {
      restoreReactionPeopleReturnFocus();
      router.back();
    } else {
      router.replace(fallbackPostHref);
    }
  }, [fallbackPostHref, router]);

  return (
    <RouteBoundary
      error={(retry) => <ReactionPeopleRouteState onBack={onBack} onRetry={retry} state="error" />}
      key={`${handle}:${postId}`}
      loading={<ReactionPeopleRouteState onBack={onBack} state="loading" />}
      title="반응한 프로필을 불러오지 못했어요"
    >
      <ReactionPeopleRouteContent
        onBack={onBack}
        postId={postId}
        requestedType={firstParam(params.type)}
        routeRelativeHandle={routeRelativeHandle}
      />
    </RouteBoundary>
  );
}

function ReactionPeopleRouteContent({
  onBack,
  postId,
  requestedType,
  routeRelativeHandle,
}: {
  onBack: () => void;
  postId: string;
  requestedType: string;
  routeRelativeHandle: string;
}) {
  const { fetchKey } = useRouteBoundary();
  const router = useRouter();
  const data = useLazyLoadQuery<ReactionPeopleRouteQuery>(
    reactionPeopleRouteQuery,
    { postId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;
  const pureRepostSource = post && !post.content && !post.replyParent ? post.repostSource : null;
  const pureRepostSourceHref = pureRepostSource
    ? getReactionPeopleHref(
        pureRepostSource.profile.relativeHandle,
        pureRepostSource.id,
        requestedType || undefined,
      )
    : null;
  const canonicalPeopleHref = post
    ? getReactionPeopleHref(post.profile.relativeHandle, post.id, requestedType || undefined)
    : null;
  const reactionCounts = post?.reactionCounts.filter(({ count }) => count > 0) ?? [];
  const reactionType = resolveReactionPeopleType(reactionCounts, requestedType);

  useEffect(() => {
    if (pureRepostSourceHref) {
      router.replace(pureRepostSourceHref);
    } else if (post && post.profile.relativeHandle !== routeRelativeHandle) {
      router.replace(canonicalPeopleHref!);
    }
  }, [canonicalPeopleHref, post, pureRepostSourceHref, routeRelativeHandle, router]);

  useEffect(() => {
    if (reactionType && reactionType !== requestedType) {
      router.setParams({ type: reactionType });
    }
  }, [reactionType, requestedType, router]);

  if (pureRepostSourceHref || (post && post.profile.relativeHandle !== routeRelativeHandle)) {
    return null;
  }

  if (!post) {
    return <ReactionPeopleRouteState onBack={onBack} state="missing" />;
  }

  if (post.state === 'DELETED') {
    return (
      <ReactionPeopleRouteChrome onBack={onBack}>
        <StateView description="작성자가 이 게시글을 삭제했어요." title="삭제된 게시글이에요" />
      </ReactionPeopleRouteChrome>
    );
  }

  if (!reactionType) {
    return (
      <ReactionPeopleRouteChrome onBack={onBack}>
        <StateView
          description="반응을 남긴 프로필이 생기면 여기에 표시돼요."
          title="아직 반응한 프로필이 없어요"
        />
      </ReactionPeopleRouteChrome>
    );
  }

  return (
    <ReactionPeopleScreen
      onBack={onBack}
      onTypeChange={(nextType) => router.setParams({ type: nextType })}
      postId={post.id}
      reactionCounts={reactionCounts}
      reactionType={reactionType}
    />
  );
}

function ReactionPeopleRouteState({
  onBack,
  onRetry,
  state,
}: {
  onBack: () => void;
  onRetry?: () => void;
  state: 'error' | 'loading' | 'missing';
}) {
  return (
    <ReactionPeopleRouteChrome onBack={onBack}>
      {state === 'loading' ? (
        <StateView loading title="반응한 프로필을 불러오는 중입니다." />
      ) : state === 'error' ? (
        <StateView
          actionLabel="다시 시도"
          alert
          description="잠시 후 다시 시도해주세요."
          onAction={onRetry}
          title="반응한 프로필을 불러오지 못했어요"
        />
      ) : (
        <StateView
          description="이미 삭제되었거나 존재하지 않는 게시글이에요."
          title="게시글을 찾을 수 없어요"
        />
      )}
    </ReactionPeopleRouteChrome>
  );
}

function ReactionPeopleRouteChrome({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <>
      <ReactionPeopleHeader onBack={onBack} />
      {children}
    </>
  );
}

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}
