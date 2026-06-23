<script lang="ts">
  import ProfileConnectionList from '$lib/components/ProfileConnectionList.svelte';

  // 팔로워 목록 라우트 골격. 상단 ProfileHero는 상위 @[handle] layout이 렌더한다.
  // 실제 followers connection 데이터 연결은 후속(PROD-184)에서 추가하며,
  // 그 전까지는 빈 상태를 표시한다.
</script>

<ProfileConnectionList kind="followers" />
