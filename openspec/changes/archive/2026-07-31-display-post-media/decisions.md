## Context

이 기록은 PROD-571의 Post 목록·상세 Media 표시 계약, PROD-570이 제공한 viewer-authorized 조회 경계,
canonical Post Content·Media 모델과 공용 앱 접근성·Relay 제약을 구현 가능한 선택으로 정리한다.

## Decision Records

### 현재 Post Content의 viewer-authorized Media만 표시한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, PROD-570,
  PROD-571
- Status: Active
- Context / Problem: document Media node는 identity와 순서를 소유하지만 표시 URL·Media Type과 현재 viewer의
  조회 가능 여부는 `PostContent.media` projection이 소유한다.
- Decision Outcome: UI는 현재 Post Content fragment의 `media` 결과만 사용하고 Media Storage Service 호출,
  raw storage reference 조립 또는 standalone Media 조회로 우회하지 않는다.
- Alternatives Considered: document의 Media ID로 standalone Node를 조회하는 방식은 PROD-570의 Post
  viewer scope를 우회하고 별도 권한 정책이 필요하므로 사용하지 않는다.
- Consequences: `PostContent.media === null`은 필요한 표시 정보 unavailable fallback이 되고 `[]`만
  media-less로 해석한다.
- Confirmation / Follow-up: 목록·상세 Relay fixture에서 ordered Media, empty와 null을 각각 검증한다.

### Sensitive Media 공개 전에는 Image를 mount하지 않는다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`,
  `docs/design/accessibility.md`, PROD-571
- Status: Active
- Context / Problem: blur나 opaque overlay만 사용하면 가림 UI 뒤에서 image byte를 미리 요청하거나 표시할 수
  있고, 보조 기술 tree에도 실제 이미지가 노출될 수 있다.
- Decision Outcome: `sensitiveMedia`가 true인 Post는 로컬 reveal state가 false인 동안 실제 `Image`를 mount하지
  않고 placeholder와 하나의 표시 button만 제공한다. 같은 button은 공개 뒤 expanded 상태와 다시 가리기
  동작을 제공한다.
- Alternatives Considered: blur overlay와 image preload는 기본 비공개 의미를 약화시키므로 선택하지 않는다.
  Media마다 별도 공개 state를 두는 방식은 document root의 전체 Media 가림 계약과 맞지 않는다.
- Consequences: 사용자가 표시하기 전에는 네트워크 이미지 요청도 시작하지 않는다. 목록과 상세에 같은 Post가
  각각 mount되면 reveal state는 공유하지 않는다.
- Confirmation / Follow-up: Storybook interaction과 component test에서 초기 미요청, 표시, 다시 가리기와
  accessible state를 확인한다.

### Retry는 현재 표시 URL의 Image load만 다시 시작한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-570, PROD-571
- Status: Active
- Context / Problem: PROD-571은 URL unavailable·image load 실패의 재시도를 요구하지만 현재 backend 계약은
  UI용 URL 재발급 mutation이나 refetch 정책을 제공하지 않는다.
- Decision Outcome: 각 Media item은 독립 오류 상태를 소유하고 재시도 시 현재 viewer-authorized `url`을 가진
  `Image`를 remount한다. GraphQL refetch, cache-busting URL 변형과 새 URL 발급은 수행하지 않는다.
- Alternatives Considered: URL에 query parameter를 붙이면 저장된 canonical 표현을 임의로 바꾸며, backend
  refetch나 재발급은 승인된 범위를 확장하므로 선택하지 않는다.
- Consequences: URL 자체가 영구적으로 무효하면 재시도도 실패하며 fallback이 유지된다. 새 URL 발급이
  필요해지면 backend 계약과 별도 이슈가 선행되어야 한다.
- Confirmation / Follow-up: 개별 실패, 다른 Media 유지, retry remount와 반복 실패를 component test로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
