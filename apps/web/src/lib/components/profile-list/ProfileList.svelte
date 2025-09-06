<script generics="ConnectionFieldName extends string" lang="ts">
  import { i18n } from '$lib/i18n.svelte';
  import ProfileListItem from './ProfileListItem.svelte';
  import type { PaginationFragmentStore } from '@kosmo/svelte-relay';
  import type { ProfileListItem_Profile_Fragment$key } from './__generated__/ProfileListItem_Profile_Fragment.graphql';

  type Props = {
    store: PaginationFragmentStore<{
      readonly [K in ConnectionFieldName]:
        | {
            readonly edges: readonly {
              readonly node: {
                readonly id: string;
              } & ProfileListItem_Profile_Fragment$key;
            }[];

            readonly pageInfo: {
              readonly hasNextPage: boolean;
            };
          }
        | null
        | undefined;
    }>;
    connectionFieldName: ConnectionFieldName;
    size?: number;
  };

  const { store, connectionFieldName, size = 20 }: Props = $props();
</script>

<div>
  {#if $store[connectionFieldName]}
    {#each $store[connectionFieldName].edges as edge (edge.node.id)}
      <ProfileListItem $profile={edge.node} />
    {:else}
      <h3 class="text-muted-foreground text-center py-12">{$i18n('list.empty')}</h3>
    {/each}
    {#if $store[connectionFieldName].pageInfo.hasNextPage}
      <button
        class="hover:bg-muted/50 border-border/50 flex w-full cursor-pointer items-center justify-center gap-2 border-b px-4 py-3 text-sm transition-colors"
        onclick={() => store.loadNext(size)}
      >
        <span>{$i18n('list.loadMore')}</span>
      </button>
    {/if}
  {:else}
    <div class="text-muted-foreground py-12 text-center">
      <p>{$i18n('list.unavailable')}</p>
    </div>
  {/if}
</div>
