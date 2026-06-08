<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment, createMutation } from '@mearie/svelte';
  import { PostVisibility } from '@kosmo/core/enums';
  import { postBodyMaxLength } from '@kosmo/core/validation';
  import Button from './Button.svelte';
  import * as Dropdown from './Dropdown';
  import PostAuthorProfile from './PostAuthorProfile.svelte';
  import PostVisibilityIcon from './PostVisibilityIcon.svelte';
  import TipTapEditor from './TipTapEditor.svelte';
  import type { Editor } from '@tiptap/core';
  import type { TipTapDocument } from '@kosmo/core/tiptap';
  import type { PostComposer_profile$key } from '$mearie';

  const postVisibilitySchemaValues = [
    PostVisibility.PUBLIC,
    PostVisibility.UNLISTED,
    PostVisibility.FOLLOWERS,
    PostVisibility.DIRECT,
  ] as const;

  type VisibilityOption = {
    label: string;
    description: string;
  };

  const visibilityOptions = {
    [PostVisibility.PUBLIC]: {
      label: '공개',
      description: '모두가 볼 수 있어요.',
    },
    [PostVisibility.UNLISTED]: {
      label: '조용한 공개',
      description: '모두가 볼 수 있지만 검색되지 않아요.',
    },
    [PostVisibility.FOLLOWERS]: {
      label: '팔로워만',
      description: '팔로워만 볼 수 있어요.',
    },
    [PostVisibility.DIRECT]: {
      label: '언급한 계정만',
      description: '이 글에서 언급한 계정만 볼 수 있어요.',
    },
  } satisfies Record<PostVisibility, VisibilityOption>;

  type Props = {
    profile: PostComposer_profile$key;
  };

  let { profile }: Props = $props();

  const profileFragment = createFragment(
    graphql(`
      fragment PostComposer_profile on Profile {
        ...PostAuthorProfile_profile
      }
    `),
    () => profile,
  );
  const [createPost] = createMutation(
    graphql(`
      mutation PostComposerCreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
        }
      }
    `),
  );

  let editor = $state<Editor | null>(null);
  let bodyText = $state('');
  let tipTapDocument = $state<TipTapDocument | null>(null);
  let selectedVisibility = $state<PostVisibility>(PostVisibility.UNLISTED);
  let editorFocused = $state(false);
  let submitting = $state(false);
  let validationMessage = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  const resetEditor = () => {
    editor?.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    selectedVisibility = PostVisibility.UNLISTED;
    editor?.commands.focus();
    errorMessage = null;
  };

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();

    if (!editor || editor.isEmpty) {
      return;
    }

    const data = await createPost({
      input: {
        content: tipTapDocument,
        visibility: selectedVisibility,
      },
    })
      .then(() => {
        resetEditor();
      })
      .finally(() => {
        submitting = false;
      });
  };
</script>

<form
  class="border-border bg-card grid w-full gap-4 rounded-md border p-4"
  aria-label="새 게시글 작성"
  onsubmit={handleSubmit}
>
  <header class="min-w-0">
    <PostAuthorProfile class="min-w-0" profile={profileFragment.data} />
  </header>

  <div
    class={`relative min-h-40 rounded-md border bg-bg transition-colors ${validationMessage ? 'border-danger' : editorFocused ? 'border-primary' : 'border-border'}`}
  >
    <TipTapEditor
      placeholder="무슨 일이 일어나고 있나요?"
      editable={!submitting}
      bind:editor
      bind:bodyText
      bind:document={tipTapDocument}
      bind:focused={editorFocused}
    />
  </div>

  {#if validationMessage || errorMessage}
    <p class="text-danger m-0 text-sm leading-5" role="alert">
      {validationMessage ?? errorMessage}
    </p>
  {/if}

  <div class="flex items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2">
      <Dropdown.Root>
        <Dropdown.Trigger>
          <Button variant="secondary" class="flex gap-1 text-sm">
            <PostVisibilityIcon visibility={selectedVisibility} class="shrink-0" />
            <span class="truncate">{visibilityOptions[selectedVisibility].label}</span>
          </Button>
        </Dropdown.Trigger>

        <Dropdown.Content aria-label="게시글 공개 설정">
          {#each postVisibilitySchemaValues as visibility}
            <Dropdown.Item
              active={visibility === selectedVisibility}
              onclick={() => {
                selectedVisibility = visibility;
              }}
            >
              <PostVisibilityIcon
                {visibility}
                class="text-text-secondary mt-0.5 shrink-0"
                size={16}
                strokeWidth={2}
              />
              <span class="grid min-w-0 gap-0.5">
                <span class="text-text-primary text-sm font-bold">
                  {visibilityOptions[visibility].label}
                </span>
                <span class="text-text-secondary text-xs leading-4">
                  {visibilityOptions[visibility].description}
                </span>
              </span>
            </Dropdown.Item>
          {/each}
        </Dropdown.Content>
      </Dropdown.Root>
    </div>

    <div class="flex items-center justify-end gap-2">
      <p
        class={`m-0 text-xs ${bodyText.length > postBodyMaxLength ? 'text-danger' : 'text-text-secondary'}`}
        aria-live="polite"
      >
        {(postBodyMaxLength - bodyText.length).toLocaleString('ko-KR')}
      </p>

      <Button
        class="shrink-0"
        type="submit"
        disabled={submitting || bodyText.length === 0 || bodyText.length > postBodyMaxLength}
        aria-busy={submitting}
      >
        {submitting ? '게시 중' : '게시'}
      </Button>
    </div>
  </div>
</form>
