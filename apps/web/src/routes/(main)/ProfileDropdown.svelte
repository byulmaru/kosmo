<script lang="ts">
  import * as validationSchema from '@kosmo/shared/validation';
  import { CirclePlus } from '@lucide/svelte';
  import { z } from 'zod';
  import { fragment, graphql, type MainLayout_ProfileDropdown_query } from '$graphql';
  import * as Dialog from '$lib/components/ui/dialog/index';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
  import { SidebarMenuButton } from '$lib/components/ui/sidebar/index';
  import Form from '$lib/components/form/Form.svelte';
  import InputField from '$lib/components/form/InputField.svelte';
  import SubmitButton from '$lib/components/form/SubmitButton.svelte';
  import { createForm, FormValidationError } from '$lib/form.svelte';

  const {
    $query: _query,
    onProfileChange,
  }: { $query: MainLayout_ProfileDropdown_query; onProfileChange: () => void } = $props();

  const query = fragment(
    _query,
    graphql(`
      fragment MainLayout_ProfileDropdown_query on Query {
        usingProfile {
          id
          displayName
          handle
        }
      }
    `),
  );

  const myProfilesQuery = graphql(`
    query MainLayout_ProfileDropdown_myProfiles @client {
      me {
        profiles {
          id
          displayName
          handle
        }
      }
    }
  `);

  const createProfile = graphql(`
    mutation MainLayout_ProfileDropdown_createProfile($input: CreateProfileInput!) {
      createProfile(input: $input) {
        __typename

        ... on CreateProfileSuccess {
          profile {
            id
            displayName
            handle
          }
        }

        ... on FieldError {
          path
          message
        }
      }
    }
  `);

  const useProfile = graphql(`
    mutation MainLayout_ProfileDropdown_useProfile($input: UseProfileInput!) {
      useProfile(input: $input) {
        __typename

        ... on UseProfileSuccess {
          profile {
            id
            displayName
            handle
          }
        }
      }
    }
  `);

  const createProfileSchema = z.object({
    handle: validationSchema.handle,
  });

  const form = createForm({
    schema: createProfileSchema,
    onSubmit: async (data) => {
      const result = await createProfile({ handle: data.handle, useCreatedProfile: true });

      if (result.__typename === 'ValidationError') {
        throw new FormValidationError({
          path: result.path,
          message: result.message,
        });
      }

      onProfileChange();
    },
  });

  let profileMenuOpen = $state(false);
  let createProfileDialogOpen = $state(false);
</script>

<DropdownMenu.Root bind:open={profileMenuOpen}>
  <DropdownMenu.Trigger class="w-full">
    <SidebarMenuButton size="lg">
      <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-gray-200">
        <span class="text-sm">👤</span>
      </div>
      <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-semibold">{$query.usingProfile?.displayName}</span>
        <span class="truncate text-xs">{$query.usingProfile?.handle}</span>
      </div>
      <span class="ml-auto">⋯</span>
    </SidebarMenuButton>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-60">
    <DropdownMenu.Group>
      {#await myProfilesQuery.load()}
        <DropdownMenu.Item disabled>로딩중...</DropdownMenu.Item>
      {:then data}
        {#each data.me?.profiles ?? [] as profile (profile.id)}
          <DropdownMenu.Item
            onclick={async () => {
              if ($query.usingProfile?.id !== profile.id) {
                $query.usingProfile = profile;
                await useProfile({ profileId: profile.id });
                onProfileChange();
              }
            }}
          >
            👤 {profile.displayName}
          </DropdownMenu.Item>
        {:else}
          <DropdownMenu.Item disabled>프로필이 없어요</DropdownMenu.Item>
        {/each}
      {/await}
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
