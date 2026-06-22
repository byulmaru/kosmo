<!-- 보호 라우트 인증 검증(캐시 없는 콜드 로드) 중 표시하는 풀스크린 스플래시. -->
<!-- (tabs) 셸 안에 중첩된 가드에서 렌더되므로, fixed 오버레이로 셸·홈 스켈레톤 위를 덮는다. -->
<!-- 임시 K 로고(중립 배경 + 아이콘 단독)를 중앙에 둔다. -->
<div class="bg-bg fixed inset-0 z-50 flex items-center justify-center">
  <span
    class="bg-primary text-text-primary flex size-16 items-center justify-center rounded-lg text-3xl font-bold"
    aria-hidden="true"
  >
    K
  </span>
  <span class="sr-only" role="status">불러오는 중입니다.</span>
</div>
