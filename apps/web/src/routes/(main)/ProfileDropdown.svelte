<script lang="ts">
  import { useFragment, useMutation } from '@kosmo/svelte-relay';
  import * as validationSchema from '@kosmo/validation';
  import { CirclePlus } from '@lucide/svelte';
  import { z } from 'zod';
  import Form from '$lib/components/form/Form.svelte';
  import InputField from '$lib/components/form/InputField.svelte';
  import SubmitButton from '$lib/components/form/SubmitButton.svelte';
  import * as Dialog from '$lib/components/ui/dialog/index';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
  import { createForm, FormValidationError } from '$lib/form.svelte';
  import { createProfileMutation, fragment, useProfileMutation } from './ProfileDropdown.graphql';
  import type { ProfileDropdown_createProfile_Mutation } from './__generated__/ProfileDropdown_createProfile_Mutation.graphql';
  import type { ProfileDropdown_MainLayout_Fragment$key } from './__generated__/ProfileDropdown_MainLayout_Fragment.graphql';
  import type { ProfileDropdown_useProfile_Mutation } from './__generated__/ProfileDropdown_useProfile_Mutation.graphql';

  const { $query: fragmentRef }: { $query: ProfileDropdown_MainLayout_Fragment$key } = $props();

  const query = useFragment(fragment, fragmentRef);

  const createProfile = useMutation<ProfileDropdown_createProfile_Mutation>(createProfileMutation);
  const useProfile = useMutation<ProfileDropdown_useProfile_Mutation>(useProfileMutation);

  const createProfileSchema = z.object({
    handle: validationSchema.handle,
  });

  const form = createForm({
    schema: createProfileSchema,
    onSubmit: async (data) => {
      const { createProfile: result } = await createProfile({
        variables: { input: { handle: data.handle, useCreatedProfile: true } },
      });

      if (result.__typename === 'CreateProfileSuccess') {
        location.reload();
      } else if (result.__typename === 'ValidationError') {
        throw new FormValidationError({
          path: result.path,
          message: result.message,
        });
      }
    },
  });

  let profileMenuOpen = $state(false);
  let createProfileDialogOpen = $state(false);
</script>

<DropdownMenu.Root bind:open={profileMenuOpen}>
  <DropdownMenu.Trigger class="w-full">
    <div class="hover:bg-muted inline-flex w-full items-center justify-center gap-2 rounded-md p-3">
      <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-gray-200">
        <span class="text-sm">👤</span>
      </div>
      <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-semibold">{$query.usingProfile?.displayName}</span>
        <span class="truncate text-xs">@{$query.usingProfile?.fullHandle}</span>
      </div>
      <span class="ml-auto">⋯</span>
    </div>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-60">
    <DropdownMenu.Group>
      {#each $query.me?.profiles ?? [] as profile (profile.id)}
        <DropdownMenu.Item
          onclick={async () => {
            if ($query.usingProfile?.id !== profile.id) {
              await useProfile({ variables: { input: { profileId: profile.id } } });
              location.reload();
            }
          }}
        >
          👤 {profile.displayName}
        </DropdownMenu.Item>
      {:else}
        <DropdownMenu.Item disabled>프로필이 없어요</DropdownMenu.Item>
      {/each}
    </DropdownMenu.Group>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onclick={() => (createProfileDialogOpen = true)}>
      <CirclePlus /> 새 프로필 추가
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<Dialog.Root bind:open={createProfileDialogOpen}>
  <Dialog.Content>
    <Form {form}>
      <Dialog.Header>
        <Dialog.Title>새 프로필 만들기</Dialog.Title>
      </Dialog.Header>
      <InputField name="handle" label="프로필 아이디" placeholder="example" />
      <Dialog.Footer>
        <SubmitButton>생성</SubmitButton>
      </Dialog.Footer>
    </Form>
  </Dialog.Content>
</Dialog.Root>
