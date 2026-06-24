import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
import type { TipTapDocument } from '@kosmo/core/tiptap';

// 게시글 본문 회귀 fixture. 목록(PostListItem)·상세(PostLayout)·본문(PostBody) 스토리가 같은 TipTap
// 문서를 공유해, 본문 렌더 규칙(문단 간격·빈 문단·긴 단어 wrapping·빈 본문 비렌더)을 한 곳에서 검증한다.
// size 강조(목록 md / 상세 lg)만 의도된 차이로 남는다(PROD-173).
//
// makePost가 만드는 객체는 PostListItem_post · PostLayout_post · PostBody_post fragment를 모두 만족하는
// superset Post shape다. Storybook이 createFragment를 passthrough로 모킹하므로
// (.storybook/mocks/mearie-svelte.ts) 각 스토리에서 `as unknown as <Fragment>$key`로 캐스팅해 넘긴다.

export type PostBodyCase = {
  label: string;
  bodyText: string | null;
  bodyJson: TipTapDocument | null;
};

const fromPlainText = (label: string, bodyText: string): PostBodyCase => ({
  label,
  bodyText,
  bodyJson: createTipTapDocumentFromPlainText(bodyText),
});

const longWord = '긴단어가포함된본문도부모너비를넘지않고줄바꿈되어야합니다'.repeat(3);

// 공유 규칙을 자극하는 정전(canonical) 케이스. 목록·상세가 동일하게 렌더해야 한다.
export const postBodyCases: PostBodyCase[] = [
  fromPlainText('짧은 한 줄', '짧은 본문 한 줄.'),
  fromPlainText(
    '여러 문단',
    '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.\n줄바꿈도 문단으로 보존됩니다.\n\n문단 사이 빈 줄도 유지됩니다.',
  ),
  {
    label: '선·후행 빈 문단',
    bodyText: '앞뒤로 빈 문단이 있어도 본문 규칙이 같아야 합니다.',
    bodyJson: {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '앞뒤로 빈 문단이 있어도 본문 규칙이 같아야 합니다.' }],
        },
        { type: 'paragraph' },
      ],
    },
  },
  {
    label: '긴 단어 wrapping',
    bodyText: longWord,
    bodyJson: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: longWord }] }],
    },
  },
  { label: '빈 본문(렌더 안 함)', bodyText: null, bodyJson: null },
];

type PostOverrides = {
  id?: string;
  createdAt?: string;
  visibility?: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
  displayName?: string;
  handle?: string;
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// PostListItem_post · PostLayout_post · PostBody_post를 모두 만족하는 superset Post 객체를 만든다.
export const makePost = (body: PostBodyCase, overrides: PostOverrides = {}) => {
  const {
    id = 'story-post',
    createdAt = minutesAgo(5),
    visibility = 'PUBLIC',
    displayName = '코스모 작가',
    handle = 'kosmo',
  } = overrides;

  return {
    __typename: 'Post',
    id,
    createdAt,
    visibility,
    profile: {
      __typename: 'Profile',
      id: `${id}-profile`,
      handle,
      displayName,
    },
    content:
      body.bodyJson === null
        ? null
        : {
            __typename: 'PostContent',
            id: `${id}-content`,
            bodyJson: body.bodyJson,
            bodyText: body.bodyText,
          },
  };
};
