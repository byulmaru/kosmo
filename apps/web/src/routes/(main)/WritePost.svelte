<script lang="ts">
  import { MAX_POST_MEDIA_COUNT } from '@kosmo/const';
  import { PostVisibility } from '@kosmo/enum';
  import { useFragment, useMutation } from '@kosmo/svelte-relay';
  import { Image, RocketIcon, XIcon } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
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

  type UploadedFile = {
    file: File;
    fileId?: string;
    uploading: boolean;
  };

  let visibility = $state($profile.config!.defaultPostVisibility);
  let editor = $state<Editor>();
  let selectedFiles = $state<UploadedFile[]>([]);

  let form: HTMLFormElement;
  let fileInput: HTMLInputElement;

  const hasUploadingFiles = $derived(selectedFiles.some((f) => f.uploading));

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!editor || hasUploadingFiles || (editor.isEmpty && selectedFiles.length === 0)) {
      return;
    }

    const { createPost: result } = await createPost({
      variables: {
        input: {
          content: editor.state.doc.toJSON(),
          visibility,
          mediaIds: selectedFiles.map((f) => f.fileId),
        },
      },
    });

    if (result.__typename === 'CreatePostSuccess') {
      visibility = $profile.config!.defaultPostVisibility;
      editor.commands.clearContent();
      selectedFiles = [];
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    const data = await response.json();
    return data.fileId;
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files) {
      return;
    }

    if (selectedFiles.length + target.files.length > MAX_POST_MEDIA_COUNT) {
      return;
    }

    const newFiles: UploadedFile[] = Array.from(target.files).map((file) => ({
      file,
      uploading: true,
    }));

    selectedFiles.push(...newFiles);
    target.value = '';

    Promise.allSettled(
      newFiles.map(async ({ file }) => {
        await uploadFile(file)
          .then((fileId) => {
            const index = selectedFiles.findIndex((f) => f.file === file);
            selectedFiles[index].fileId = fileId;
            selectedFiles[index].uploading = false;
          })
          .catch(() => {
            selectedFiles = selectedFiles.filter((f) => f.file !== file);
            toast.error('파일 업로드에 실패했어요.');
          });
      }),
    );
  };

  const removeFile = (index: number) => {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
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
    {#if selectedFiles.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each selectedFiles as uploadedFile, index (uploadedFile.file)}
          <div class="group relative">
            <img
              class="size-16 rounded-md border object-cover"
              alt={uploadedFile.file.name}
              src={URL.createObjectURL(uploadedFile.file)}
            />
            {#if uploadedFile.uploading}
              <div
                class="bg-background/80 absolute inset-0 flex items-center justify-center rounded-md"
              >
                <div
                  class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                ></div>
              </div>
            {/if}
            <Button
              class="absolute -right-2 -top-2 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              onclick={() => removeFile(index)}
              size="icon"
              type="button"
              variant="destructive"
            >
              <XIcon class="h-4 w-4" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}
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
      <Button onclick={() => fileInput?.click()} size="icon" type="button" variant="ghost">
        <input
          bind:this={fileInput}
          class="hidden"
          accept="image/*"
          multiple
          onchange={handleFileChange}
          type="file"
        />
        <Image />
      </Button>
      <div class="flex-1"></div>
      <Button disabled={hasUploadingFiles} type="submit">
        <RocketIcon />{$i18n('post.write.submit')}
      </Button>
    </div>
  </form>
</div>
