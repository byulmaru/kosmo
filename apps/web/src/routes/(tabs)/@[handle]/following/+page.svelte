<script lang="ts">
  import ProfileConnectionList from '$lib/components/ProfileConnectionList.svelte';

  // 팔로잉 목록 라우트 골격. 상단 ProfileHero는 상위 @[handle] layout이 렌더한다.
  // 팔로워 목록과 같은 ProfileConnectionList를 재사용해 시각/상태 구조를 일치시킨다.
  // 실제 following connection 데이터 연결은 후속(PROD-185)에서 추가하며,
  // 그 전까지는 빈 상태를 표시한다.
</script>

<ProfileConnectionList kind="following" />
