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
  각각 mount되면 reveal state는 공유하지 않는다. Web에서는 공개·가리기 전환에도 같은 control을 mount
  상태로 유지해 keyboard focus를 보존한다.
- Confirmation / Follow-up: Storybook interaction과 component test에서 초기 미요청, 표시, 다시 가리기와
  accessible state를 확인하고 Web keyboard focus가 같은 control에 남는지 검증한다.

### 앱 표시용 V1 guard는 소비하지 않는 추가 속성을 무시한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, ADR-0022, PROD-571
- Status: Active
- Context / Problem: V1 안에서 허용되는 additive 속성이나 이전 초안의 `media.attrs.altText`처럼 앱이 소비하지
  않는 속성 때문에 exact-shape guard가 전체 document 표시를 fallback으로 전환했다.
- Decision Outcome: 유니버설 앱의 runtime-independent guard는 필수 V1 구조·타입, 지원 node·mark와 안전한
  URL을 검증하되 소비하지 않는 추가 object 속성은 무시한다. 서버 canonical write validation은 계속 strict
  schema를 적용하고 저장 전에 불필요한 속성을 제거한다.
- Alternatives Considered: 알려진 legacy 속성을 하나씩 허용 목록에 추가하면 다음 additive 확장마다 같은
  표시 장애가 반복되고, 서버 validator까지 완화하면 canonical 저장 계약을 약화하므로 선택하지 않는다.
- Consequences: additive 속성이 있는 유효한 V1은 표시되지만 알 수 없는 node·mark, 잘못된 필수 값, 위험한
  URL과 지원하지 않는 version은 계속 안전한 fallback으로 처리된다.
- Confirmation / Follow-up: core unit test에서 여러 계층의 추가 속성과 legacy `altText`를 포함한 V1 수용,
  미지원 node 거부를 함께 검증한다.

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

### 원본 비율을 따르되 세로 Media 높이는 surface 폭으로 제한한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-571
- Status: Active
- Context / Problem: 모든 Media를 16:9로 고정하면 가로 이미지도 불필요하게 crop되고, 원본 비율을 제한 없이
  적용하면 긴 세로 이미지 하나가 목록과 상세의 과도한 높이를 차지한다.
- Decision Outcome: `Image.getSize()`의 원본 `width / height`를 사용한다. surface는 가로 폭을 모두 채우고,
  가로·정사각형 이미지는 원본 비율을 유지하며 세로 이미지는 최대 1:1 frame에서 `cover` crop한다.
- Alternatives Considered: 16:9 고정 frame은 가로 원본의 구도를 잃고, 세로 원본 높이를 그대로 표시하는
  방식은 피드 밀도를 예측하기 어려워 선택하지 않는다.
- Consequences: 원본 크기를 알기 전에는 1:1 frame을 사용하며 가로 이미지 load 뒤 높이가 줄어들 수 있다.
  별도 thumbnail 생성이나 Media metadata GraphQL 확장은 필요하지 않다.
- Confirmation / Follow-up: component test에서 가로 원본 비율과 세로 1:1 clamp를 검증하고 실제 Web 화면에서
  frame 크기를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-30의 16:9 고정 image box 구현 선택은 원본 비율 기반·세로 1:1 제한으로 대체한다.
