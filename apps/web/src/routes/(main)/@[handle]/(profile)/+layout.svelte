<script lang="ts">
  import { ProfileRelationshipState } from '@kosmo/enum';
  import { usePreloadedQuery } from '@kosmo/svelte-relay';
  import { resolve } from '$app/paths';
  import Avatar from '$lib/components/avatar/Avatar.svelte';
  import FollowButton from '$lib/components/follow-button/FollowButton.svelte';
  import DefaultHeader from '$lib/components/header/DefaultHeader.svelte';
  import { Button } from '$lib/components/ui/button';
  import { i18n } from '$lib/i18n.svelte';

  const { children, data } = $props();

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

  const query = $derived(usePreloadedQuery(data.query));
</script>

<svelte:head>
  <link href={$query.profile?.uri} rel="alternate" type="application/activity+json" />
</svelte:head>

{#if $query.profile}
  <DefaultHeader title={$query.profile.displayName} />
  <div class="bg-card text-card-foreground w-full border-y">
    <div class="relative">
      <img class="w-full object-cover" alt="Header" src="https://placehold.co/1500x500" />
      {#if $query.profile.relationship.from === ProfileRelationshipState.FOLLOW}
        <div
          class="bg-background/80 text-foreground absolute right-4 top-4 rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm"
        >
          {$query.profile.relationship.to === ProfileRelationshipState.FOLLOW
            ? $i18n('profile.status.followEachOther')
            : $i18n('profile.status.followsYou')}
        </div>
      {/if}
    </div>
    <div class="p-4">
      <div class="flex items-start justify-between">
        <Avatar class="border-background -mt-20 h-32 w-32 border-4" $profile={$query.profile} />
        <div>
          {#if $query.profile.isMe}
            <Button variant="outline">{$i18n('profile.button.edit')}</Button>
          {:else}
            <FollowButton $profile={$query.profile} />
          {/if}
        </div>
      </div>
      <div class="my-2">
        <div class="text-xl font-bold">{$query.profile.displayName}</div>
        <div onclick={selectText} role="none">
          <span class="text-muted-foreground">@{$query.profile.handle}</span><span
            class="text-muted-foreground/60">@{$query.profile.instance.domain}</span
          >
        </div>
      </div>
      <div class="my-2">
        <p>{$query.profile.description}</p>
      </div>
      <div class="my-2 flex gap-4">
        <a
          class="flex gap-1"
          href={resolve(`/(main)/@[handle]/(profile)/following`, {
            handle: $query.profile.relativeHandle,
          })}
        >
          <span class="font-semibold">{$query.profile.followingCount.toLocaleString()}</span>
          <span class="text-muted-foreground">{$i18n('profile.stat.following')}</span>
        </a>
        <a
          class="flex gap-1"
          href={resolve(`/(main)/@[handle]/(profile)/followers`, {
            handle: $query.profile.relativeHandle,
          })}
        >
          <span class="font-semibold">{$query.profile.followerCount.toLocaleString()}</span>
          <span class="text-muted-foreground">{$i18n('profile.stat.followers')}</span>
        </a>
      </div>
    </div>
  </div>
  {@render children()}
{:else}
  <div class="text-muted-foreground p-8 text-center">Profile not found.</div>
{/if}
