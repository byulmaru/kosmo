## Context

이 기록은 PROD-639가 기존 Post Composer Media 첨부 계약에 Web clipboard image source를 추가할 때 지켜야 할 공용 lifecycle, Web event 범위, validation 소유권과 아직 상위 결정을 요구하는 혼합 payload 행동을 구분한다.

## Decision Records

### Clipboard Media는 기존 Composer 목록과 업로드 lifecycle을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, PROD-639, PROD-553
- Status: Active
- Context / Problem: picker Media와 clipboard Media가 서로 다른 state·업로드·제출 경계를 가지면 같은 Composer에서 순서, 최대 개수, 실패 복구와 create input이 source별로 달라진다.
- Decision Outcome: clipboard image는 picker image와 같은 최대 4개 Composer Media 목록에 추가 순서대로 들어가며, 같은 발급 → 직접 PUT → 완료, preview·실패·재시도·제거·Alt Text·Sensitive Media와 제출 lifecycle을 사용한다. clipboard source만을 위한 GraphQL, Media state 또는 submission 배열을 추가하지 않는다.
- Alternatives Considered: clipboard File을 즉시 별도 endpoint로 보내는 경로는 Media Storage Service 직접 업로드 경계와 기존 item 복구 UI를 복제한다. paste item을 게시 시점에만 일괄 업로드하면 picker의 선택 즉시 업로드·실패 복구 계약과 달라진다.
- Consequences: picker와 paste가 공용 item 추가·upload 경계에 수렴해야 하며, 두 source를 섞은 추가 순서를 보존한다. 기존 orphan Media 제외 범위도 동일하게 남는다.
- Confirmation / Follow-up: component/browser 검증에서 picker 뒤 paste와 paste 뒤 picker의 item 순서, 실패·재시도·제거와 `createPost` Media 순서를 확인한다.

### Web paste event는 실제 Composer editor에만 결속한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, PROD-639
- Status: Active
- Context / Problem: 하나의 화면에 inline composer, compose surface와 Reply surface가 함께 존재할 수 있어 document 전역 listener는 focus되지 않은 Composer까지 같은 paste를 처리할 수 있다. 별도 clipboard read API는 사용자 gesture 외 권한과 browser 차이를 추가한다.
- Decision Outcome: Web image paste는 현재 Media control과 연결된 실제 본문 editor DOM element의 `paste` event payload만 처리한다. document/window 전역 listener와 `navigator.clipboard.read()`를 사용하지 않으며 Native에는 listener를 등록하지 않는다.
- Alternatives Considered: document 전역 listener는 여러 Composer 중 실제 target을 다시 판별해야 하고 누락 시 중복 첨부 위험이 있다. `navigator.clipboard.read()`는 paste event 없이 권한 요청과 비동기 clipboard read lifecycle을 추가한다. 공용 React Native prop에 비표준 DOM File event를 그대로 전달하는 방식은 Native type/runtime 경계를 흐린다.
- Consequences: editor ref와 Media control 사이에 Web event 연결이 필요하고 mount·editor 교체 때 listener cleanup을 보장해야 한다. 실제 event target의 기본 paste 동작을 보존할 수 있다.
- Confirmation / Follow-up: focus된 editor에서만 image paste가 동작하고 다른 editor·Composer 밖 paste가 Media side effect를 만들지 않는지 실제 browser event로 확인한다.

### Clipboard source는 새 Media validation 정책을 소유하지 않는다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, PROD-639
- Status: Active
- Context / Problem: clipboard File은 MIME과 byte metadata를 제공하지만 앱이 picker와 다른 allowlist·크기·픽셀 검사를 추가하면 Media Storage Service의 기존 이미지 검증과 지원 형식 정책을 복제한다.
- Decision Outcome: Web client는 clipboard에서 browser가 non-null `image/*` File로 제공한 item만 이미지 후보로 추출한다. 실제 형식·크기·픽셀 지원 여부와 upload 성공은 기존 Media Storage Service lifecycle 결과를 사용하며 clipboard 전용 변환·압축·HEIC 처리나 allowlist를 만들지 않는다.
- Alternatives Considered: 앱에 현재 MIME·크기·픽셀 제한을 hard-code하면 storage 정책 변경 때 picker와 paste가 어긋나고 canonical Media 경계를 중복한다. 모든 `kind=file` item을 이미지로 보내면 명백한 non-image File에도 불필요한 Media side effect를 만든다.
- Consequences: `File.type`이 비어 있거나 image가 아닌 item은 clipboard image 후보가 아니다. storage가 거부한 image 후보는 기존 item 실패·재시도·제거 UI로 복구한다.
- Confirmation / Follow-up: non-image File, 빈 File, storage PUT/완료 거부를 검증하고 clipboard source만의 지원 MIME 상수를 추가하지 않았는지 확인한다.

### 이미지와 텍스트가 함께 있는 clipboard payload 결과

- Decision Date: 2026-08-04
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Blocked
- Context / Problem: PROD-639는 혼합 payload에 명확한 우선순위가 필요하다고 기록하지만 이미지 첨부, 본문 텍스트 삽입 또는 둘 다 수행 중 어떤 사용자 결과를 선택하는지 정하지 않았다. 이 선택은 Post 본문과 첨부 결과를 바꾸는 제품 행동이다.
- Decision Outcome: 현재 OpenSpec은 이미지 우선, 텍스트 우선 또는 둘 다 처리 중 어느 것도 구현 계약으로 채택하지 않는다. 혼합 payload를 만난 listener의 기본 동작 취소와 Media 추가 여부는 upstream 결정 전까지 구현하지 않는다.
- Alternatives Considered: 이미지 우선은 clipboard text를 버리고, 텍스트 우선은 사용자가 기대한 이미지 첨부를 건너뛴다. 둘 다 처리는 clipboard가 제공한 대체 표현까지 중복 삽입할 수 있다. 현재 authority로 trade-off를 선택할 수 없다.
- Consequences: PROD-639의 전체 완료 조건과 구현 착수는 이 결과가 상위 계약에 기록되고 승인될 때까지 막힌다. image-only와 text-only spec은 유지할 수 있지만 tasks에 혼합 payload 구현 checkbox를 추가할 수 없다.
- Confirmation / Follow-up: PROD-639 본문 또는 계약 변경 댓글에 선택 결과와 이유를 기록하고 Issue Gate 승인을 받은 뒤, 이 record를 구체 authority가 있는 Active class로 재작성하며 specs·tasks·strict validation을 갱신한다.

## Remaining Decisions

- `이미지와 텍스트가 함께 있는 clipboard payload 결과`가 Blocked 상태다.

## Superseded Decisions

- 없음.
