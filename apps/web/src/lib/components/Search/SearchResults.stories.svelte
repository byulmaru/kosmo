<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { ProfileListItem_profile$key } from '$mearie';

  import SearchResults from './SearchResults.svelte';

  const viewerProfileId = 'viewer-profile';

  const profile = (
    overrides: Partial<{
      id: string;
      displayName: string;
      handle: string;
      bio: string | null;
      viewerFollow: { id: string; state: 'ACCEPTED' | 'PENDING' } | null;
    }> = {},
  ): ProfileListItem_profile$key =>
    ({
      __typename: 'Profile',
      id: 'searched-profile',
      displayName: '별마루',
      handle: 'byulmaru',
      bio: '코스모에서 만나는 첫 프로필',
      viewerFollow: null,
      ...overrides,
    }) as unknown as ProfileListItem_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/SearchResults',
    component: SearchResults,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    query: '별마루',
    profile: profile(),
    profileHref: '/@byulmaru',
    viewerProfileId,
  }}
/>

<!-- 사람 탭 검색 상태 전체: 입력 전(idle), 로딩, 오류, 결과 있음, 결과 없음. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[390px] gap-8">
    <SearchResults />
    <SearchResults query="별마루" loading />
    <SearchResults query="별마루" error onRetry={() => {}} />
    <SearchResults query="별마루" profile={profile()} profileHref="/@byulmaru" {viewerProfileId} />
    <SearchResults query="없는핸들" />
  </div>
</Story>
