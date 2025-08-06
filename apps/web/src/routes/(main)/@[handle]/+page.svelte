<script lang="ts">
  import { graphql } from '$graphql';
  import { Avatar, AvatarImage } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { i18n } from '$lib/i18n.svelte';
  import { ProfileRelationship } from '@kosmo/shared/enums';

  const query = graphql(`
    query MainHandlePage_Query($handle: String!) {
      profile(handle: $handle) {
        id
        displayName
        handle
        description
        relationship
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
            relationship
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
            relationship
          }
        }
      }
    }
  `);
</script>

{#if $query.profile}
  {@const profile = $query.profile}
  <div class="bg-card text-card-foreground w-full rounded-lg border">
    <img src="https://placehold.co/1500x500" alt="Header" class="w-full object-cover" />
    <div class="p-4">
      <div class="flex items-start justify-between">
        <Avatar class="border-background -mt-16 h-24 w-24 rounded-lg border-4">
          <AvatarImage src="https://placehold.co/400x400" alt={profile.handle} />
        </Avatar>
        <div>
          {#if profile.relationship === null}
            <Button variant="outline" onclick={() => followProfile({ profileId: profile.id })}
              >{$i18n('profile.button.follow')}</Button
            >
          {:else if profile.relationship === ProfileRelationship.FOLLOWER}
            <Button variant="outline" onclick={() => followProfile({ profileId: profile.id })}
              >{$i18n('profile.button.followBack')}</Button
            >
          {:else if profile.relationship === ProfileRelationship.FOLLOWING || profile.relationship === ProfileRelationship.MUTUAL}
            <Button variant="outline" onclick={() => unfollowProfile({ profileId: profile.id })}
              >{$i18n('profile.button.unfollow')}</Button
            >
          {:else if profile.relationship === ProfileRelationship.ME}
            <Button variant="outline">{$i18n('profile.button.edit')}</Button>
          {/if}
        </div>
      </div>
      <div class="my-2">
        <div class="text-xl font-bold">{profile.displayName}</div>
        <div class="text-muted-foreground">@{profile.handle}</div>
      </div>
      <div class="my-2">
        <p>{profile.description}</p>
      </div>
    </div>
  </div>
{:else}
  <div class="text-muted-foreground p-8 text-center">Profile not found.</div>
{/if}
