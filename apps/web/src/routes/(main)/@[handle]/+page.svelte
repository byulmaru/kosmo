<script lang="ts">
  import { graphql } from '$graphql';
  import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';

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
      }
    }
  `);

  const unfollowProfile = graphql(`
    mutation MainHandlePage_unfollowProfile($input: UnfollowProfileInput!) {
      unfollowProfile(input: $input) {
        __typename
      }
    }
  `);
</script>

{#if $query.profile}
  {@const profile = $query.profile}
  <div class="bg-card text-card-foreground w-full rounded-lg border">
    <img
      src="https://placehold.co/1500x500"
      alt="Header"
      class="w-full object-cover"
    />
    <div class="p-4">
      <div class="flex items-start justify-between">
        <Avatar class="border-background -mt-16 h-24 w-24 border-4 rounded-lg">
          <AvatarImage src="https://placehold.co/400x400" alt={profile.handle} />
        </Avatar>
        <Button variant="outline">Follow</Button>
      </div>
      <div class="mt-2">
        <div class="text-xl font-bold">{profile.displayName}</div>
        <div class="text-muted-foreground">@{profile.handle}</div>
      </div>
      {#if profile.description}
        <div class="mt-4">
          <p>{profile.description}</p>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="text-muted-foreground p-8 text-center">Profile not found.</div>
{/if}
