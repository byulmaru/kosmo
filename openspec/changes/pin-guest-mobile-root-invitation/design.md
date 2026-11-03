## Current Constraints

이 문서는 비구속 작업 메모다. 기준 코드는 `5ae60a01a13e99c07a8e579b47eb7cbc10a154b7`이다.

- `UniversalShell.tsx`는 mobile이면 하단 탭을 렌더링하고 Web 본문에 탭 높이·safe area·고정 안내 높이를 더한다. 안내의 닫힘 상태는 `sessionStorage`와 현재 렌더 상태로 유지한다.
- `publicContentInvitationLayout.ts`는 모바일 안내를 하단 탭 위 `80px`에 두고, 폭 `360px` 미만 또는 높이 `520px` 미만이면 flow로 전환한다. 셸과 안내가 같은 helper를 각각 호출한다.
- `PublicContentInvitation.tsx`는 안내 문구·닫기·CTA·보조 링크 전체를 렌더링하고 `onLayout`으로 높이를 전달한다. 기존 모바일 fixed 배치는 bottom inset만큼 패널을 올린다.
- `apps/web/e2e/auth-routes.e2e.ts`는 모바일 공개 `/`·Profile·Post 모두에서 하단 탐색이 보인다고 검증한다. 이 기대 중 루트만 바뀐다.
- 제품 기준은 현재 canonical과 PROD-1232다. `openspec/specs/web-app-shell/spec.md`에 남은 과거 Welcome 설명을 복원하지 않는다.

## Practical Approach

- 셸에서 Web·guest·정확한 `/`·mobile 조건을 파생한다. 탭 가시성을 안내의 visible·dismissed 상태와 분리해 닫은 뒤에도 탭과 탭용 여백이 생기지 않게 한다.
- 기존 안내 전체에 루트 전용 fixed 배치를 적용한다. 패널 배경은 화면 맨 아래까지 이어지고, 내부 control은 하단 safe area 안에 놓이도록 한다. 좌우 safe area도 확인한다.
- 해당 배치에서는 작은 폭·높이의 flow 예외를 적용하지 않는다. 기존 문구와 action을 보존하고 확대·reflow에서도 모든 control에 접근할 수 있게 한다.
- 패널 배치와 셸의 예약 높이를 같은 판단에 따라 계산한다. 패널이 차지하는 전체 높이에 safe area를 한 번만 포함하고 본문 하단 여백으로 예약한다. 닫으면 안내 예약분을 해제한다.
- 기존 Web document/window scroll, 탭 단위 닫힘과 상단 메뉴를 재사용한다. session error나 선택 Profile 부재를 guest로 간주하지 않는다.
- 구현과 함께 `docs/design/public-content-onboarding.md`와 `docs/design/breakpoints.md`에 루트 예외를 반영한다. 제품 범위 설명은 `docs/domain/policies/public-content-onboarding.md`에 결과 수준으로 반영한다.

## Alternatives and Traps

안내를 복제하거나 공개 route 전체의 helper 기본값을 바꾸면 다른 경로의 배치까지 달라질 수 있다. route 조건은 조합 경계가 소유하고 실제 콘텐츠·인증 action은 기존 안내에 둔다. 패널 높이와 별개로 탭 높이나 safe area를 다시 더하면 빈 공간이 남는다.

## Risks / Limits

고정 안내의 높이는 줄바꿈·확대·safe area에 따라 바뀐다. 예약 공간과 실제 패널 높이가 함께 갱신되는지, 마지막 항목과 focus된 control이 가려지지 않는지 브라우저에서 확인해야 한다. 작은 높이에서 패널 자체가 가용 영역을 넘는 경우도 확인한다. 이 세션은 runtime·기기 검증을 실행하지 않는다.

DB·서버·인증 계약 변경은 없다. 별도 migration이나 rollout gate를 추가하지 않으며, 필요하면 이 변경의 셸·안내 배치를 되돌려 기존 표현으로 복구할 수 있다.

## Open Questions

없음. 구현 중 현재 범위를 넘는 제품 선택이 필요해지면 그 경계에서 질문한다.
