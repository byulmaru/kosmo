<script lang="ts">
  import { PostVisibility } from '@kosmo/enum';
  import { useFragment, useMutation } from '@kosmo/svelte-relay';
  import { Image, RocketIcon } from '@lucide/svelte';
  import z from 'zod';
  import { resolve } from '$app/paths';
  import ProfileAvatar from '$lib/components/avatar/Avatar.svelte';
  import Form from '$lib/components/form/Form.svelte';
  import PostVisibilityIcon from '$lib/components/PostVisibilityIcon.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { createForm } from '$lib/form.svelte';
  import { i18n } from '$lib/i18n.svelte';
  import { createPostMutation, fragment } from './WritePost.graphql';
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

  const form = createForm({
    schema: z.object({
      content: z.string().min(1, 'error.common.required'),
      visibility: z.enum(PostVisibility),
    }),
    onSubmit: async (data) => {
      const { createPost: result } = await createPost({
        variables: { input: { content: data.content, visibility: data.visibility } },
      });

      if (result.__typename === 'CreatePostSuccess') {
        visibility = $profile.config!.defaultPostVisibility;
        form.reset();
      }
    },
  });
</script>

<a
  class="flex items-center gap-3"
  href={resolve(`/(main)/@[handle]`, { handle: $profile.relativeHandle })}
>
  <ProfileAvatar class="size-10" {$profile} />
  <div class="min-w-0 flex-1">
    <div class="text-sm font-semibold">{$profile.displayName}</div>
    <div class="text-muted-foreground text-xs">
      @{$profile.fullHandle}
    </div>
  </div>
</a>
<div class="bg-card rounded-md border p-3">
  <Form class="flex flex-col gap-2" {form}>
    <textarea
      name="content"
      class="min-h-24 w-full resize-none outline-none"
      oninput={(e) => {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
      }}
      onkeydown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          form.submit();
        }
      }}
      placeholder={$i18n('post.write.placeholder')}
    ></textarea>
    <div>
      <input name="visibility" type="hidden" value={visibility} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
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
      <Button type="submit"><RocketIcon />{$i18n('post.write.submit')}</Button>
    </div>
  </Form>
</div>
