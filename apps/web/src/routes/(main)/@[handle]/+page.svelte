<script lang="ts">
  import { ProfileRelationshipState } from '@kosmo/enum';
  import { graphql } from '$graphql';
  import DefaultHeader from '$lib/components/header/DefaultHeader.svelte';
  import { Avatar, AvatarImage } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { i18n } from '$lib/i18n.svelte';

  const selectText = (event: MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.type === 'Range') {
      return;
    }

    const node = event.currentTarget as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const query = graphql(`
    query MainHandlePage_Query($handle: String!) {
      profile(handle: $handle) {
        id
        uri
        displayName
        handle
        description

        relationship {
          to
          from
        }

        instance {
          id
          domain
        }
      }

      usingProfile {
        id
      }
    }
  `);

  const followProfile = graphql(`
    mutation MainHandlePage_followProfile($input: FollowProfileInput!) {
      followProfile(input: $input) {
        __typename

        ... on FollowProfileSuccess {
          profile {
            id

            relationship {
              to
              from
            }
          }
        }
      }
    }
  `);

  const unfollowProfile = graphql(`
    mutation MainHandlePage_unfollowProfile($input: UnfollowProfileInput!) {
      unfollowProfile(input: $input) {
        __typename

        ... on UnfollowProfileSuccess {
          profile {
            id

            relationship {
              to
              from
            }
          }
        }
      }
    }
  `);

  let isFollowingHovered = $state(false);
</script>

<svelte:head>
  <link href={$query.profile?.uri} rel="alternate" type="application/activity+json" />
</svelte:head>

{#if $query.profile}
  {@const profile = $query.profile}
  <DefaultHeader title={profile.displayName} />
  <div class="bg-card text-card-foreground w-full rounded-lg border">
    <div class="relative">
      <img class="w-full object-cover" alt="Header" src="https://placehold.co/1500x500" />
      {#if profile.relationship.from === ProfileRelationshipState.FOLLOW}
        <div
          class="bg-background/80 text-foreground absolute right-4 top-4 rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm"
        >
          {profile.relationship.to === ProfileRelationshipState.FOLLOW
            ? $i18n('profile.status.followEachOther')
            : $i18n('profile.status.followsYou')}
        </div>
      {/if}
    </div>
    <div class="p-4">
      <div class="flex items-start justify-between">
        <Avatar class="border-background -mt-16 h-24 w-24 rounded-lg border-4">
          <AvatarImage alt={profile.handle} src="https://placehold.co/400x400" />
        </Avatar>
        <div>
          {#if profile.id === $query.usingProfile?.id}
            <Button variant="outline">{$i18n('profile.button.edit')}</Button>
          {:else if profile.relationship.to === null}
            <Button onclick={() => followProfile({ profileId: profile.id })} variant="outline"
              >{profile.relationship.from === ProfileRelationshipState.FOLLOW
                ? $i18n('profile.button.followBack')
                : $i18n('profile.button.follow')}</Button
            >
          {:else if profile.relationship.to === ProfileRelationshipState.FOLLOW}
            <Button
              class="w-24"
              onclick={() => unfollowProfile({ profileId: profile.id })}
              onmouseenter={() => (isFollowingHovered = true)}
              onmouseleave={() => (isFollowingHovered = false)}
              variant={isFollowingHovered ? 'destructive' : 'outline'}
              >{isFollowingHovered
                ? $i18n('profile.button.unfollow')
                : $i18n('profile.button.following')}</Button
            >
          {/if}
        </div>
      </div>
      <div class="my-2">
        <div class="text-xl font-bold">{profile.displayName}</div>
        <div onclick={selectText} role="none">
          <span class="text-muted-foreground">@{profile.handle}</span><span
            class="text-muted-foreground/60">@{profile.instance.domain}</span
          >
        </div>
      </div>
      <div class="my-2">
        <p>{profile.description}</p>
      </div>
    </div>
  </div>
{:else}
  <div class="text-muted-foreground p-8 text-center">Profile not found.</div>
{/if}
