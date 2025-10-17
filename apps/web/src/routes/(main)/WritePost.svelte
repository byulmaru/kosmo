<script lang="ts">
  import { PostVisibility } from '@kosmo/enum';
  import { useFragment, useMutation } from '@kosmo/svelte-relay';
  import { Image, RocketIcon } from '@lucide/svelte';
  import PostVisibilityIcon from '$lib/components/PostVisibilityIcon.svelte';
  import ProfileInfo from '$lib/components/profile-info/ProfileInfo.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { i18n } from '$lib/i18n.svelte';
  import TiptapEditor from '$lib/tiptap/TiptapEditor.svelte';
  import { createPostMutation, fragment } from './WritePost.graphql';
  import type { Editor } from '@tiptap/core';
  import type { WritePost_createPost_Mutation } from './__generated__/WritePost_createPost_Mutation.graphql';
  import type { WritePost_Profile_Fragment$key } from './__generated__/WritePost_Profile_Fragment.graphql';

  const POST_VISIBILITY = [
    PostVisibility.PUBLIC,
    PostVisibility.UNLISTED,
    PostVisibility.FOLLOWER,
    PostVisibility.DIRECT,
  ] satisfies PostVisibility[];

  const { $profile: profileRef }: { $profile: WritePost_Profile_Fragment$key } = $props();
  const profile = useFragment(fragment, profileRef);
  const createPost = useMutation<WritePost_createPost_Mutation>(createPostMutation);

  let visibility = $state($profile.config!.defaultPostVisibility);
  let editor = $state<Editor>();

  let form: HTMLFormElement;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!editor || editor.isEmpty) {
      return;
    }

    const { createPost: result } = await createPost({
      variables: { input: { content: editor.state.doc.toJSON(), visibility } },
    });

    if (result.__typename === 'CreatePostSuccess') {
      visibility = $profile.config!.defaultPostVisibility;
      editor.commands.clearContent();
    }
  };
</script>

<ProfileInfo {$profile} />
<div class="bg-card mt-3 rounded-md border p-3">
  <form bind:this={form} class="flex flex-col gap-2" onsubmit={handleSubmit}>
    <TiptapEditor
      class="min-h-24"
      onkeydown={(_, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          form.requestSubmit();
        }
      }}
      bind:editor
    />
    <div>
      <input name="visibility" type="hidden" value={visibility} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger tabindex={-1}>
          <Button size="sm" variant="outline">
            <PostVisibilityIcon {visibility} />{$i18n(`post.visibility.${visibility}.title`)}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {#each POST_VISIBILITY as v (v)}
            <DropdownMenu.Item
              class="flex flex-col items-start"
              onclick={() => {
                visibility = v;
              }}
            >
              <span class="flex items-center gap-2">
                <PostVisibilityIcon visibility={v} />
                {$i18n(`post.visibility.${v}.title`)}
              </span>
              <span class="text-muted-foreground text-xs">
                {$i18n(`post.visibility.${v}.description`)}
              </span>
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <div class="flex">
      <Button size="icon" variant="ghost"><Image /></Button>
      <div class="flex-1"></div>
      <Button type="submit">
        <RocketIcon />{$i18n('post.write.submit')}
      </Button>
    </div>
  </form>
</div>
