## Context

이 기록은 `PROD-657`의 현재 client slice, Media Storage Service 경계를 확정한 canonical domain 문서, 새 공통
오류 디자인과 기존 Post Composer/Profile 편집의 실패 보존·재시도 계약을 반영한다. 구현 세부 이름보다 두
consumer와 이후 배포가 함께 지켜야 하는 분류, 정보 노출과 상태 보존 결정을 기록한다.

## Decision Records

### 업로드 오류는 단계와 사용자-facing 원인을 독립적으로 분류한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/media-upload-errors.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0013-media-storage-service-boundary.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-657`
- Status: Active
- Context / Problem: generic 실패 하나로는 사용자가 다른 파일을 선택해야 하는지, 같은 항목을 재시도해야 하는지
  알 수 없고 issue/transfer/complete 중 어느 단계가 실패했는지도 두 consumer가 일관되게 표현할 수 없다.
- Decision Outcome: 실패 단계는 `issue | transfer | complete`, 사용자-facing 원인은
  `unsupported-format | file-too-large | image-too-large | invalid-image | transient`로 독립 분류한다. transfer의
  네 구체 원인은 canonical status/code allowlist가 함께 일치할 때만 사용하고 나머지는 transient로 접는다.
- Alternatives Considered: code만으로 원인을 선택하면 예상하지 않은 status와 서비스 변경을 과도하게 신뢰하고,
  status만으로 선택하면 같은 `422`의 해상도·손상 원인을 구분할 수 있어 제외했다. 단계 없이 원인만 저장하는
  방식은 issue/complete transient 안내를 구분하지 못해 제외했다.
- Consequences: 새 Storage code는 안전한 transient로 폴백하며, 새 사용자 원인을 추가하려면 canonical 디자인과
  Linear 계약을 먼저 갱신해야 한다.
- Confirmation / Follow-up: 정상 `2xx`, 모든 allowlisted 조합, status 불일치, unknown/malformed/empty, network와
  `5xx`, issue/complete 실패를 공통 분류 테스트로 검증한다.

### 외부 오류 원문은 UI 계약에 들어오지 않는다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/media-upload-errors.md`, `docs/design/profile-edit.md`, `PROD-657`
- Status: Active
- Context / Problem: Storage Service의 `error.message`와 raw body는 내부 구현·token·식별 정보를 포함할 수 있고,
  consumer마다 이를 조합하면 한국어 copy와 보안 경계가 달라진다.
- Decision Outcome: 사용자 문구와 accessible name은 앱이 소유한 안전한 `{subject}`와 공통 stage/reason에서만
  만든다. 외부 message, body, URL, header와 내부 식별자는 표시 문자열의 입력으로 사용하지 않는다.
- Alternatives Considered: allowlisted code의 message만 표시하는 방식도 같은 code에서 message가 배포별로 바뀌고
  안전성을 client가 보장할 수 없어 제외했다. 원문 뒤에 generic 안내를 덧붙이는 방식도 내부 정보 노출을 막지
  못해 제외했다.
- Consequences: 외부 detail은 사용자에게 보이지 않으며, 관측성 요구는 이 UI change가 아니라 별도 승인된
  logging 계약이 소유한다.
- Confirmation / Follow-up: 원문 message·URL·token을 포함한 fixture에서도 canonical 한국어 문구와 accessible
  name만 노출되는지 검증한다.

### 실패 결과는 semantic 분류로 보존하고 현재 UI subject는 render에서 결합한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/media-upload-errors.md`, `docs/design/accessibility.md`, `PROD-657`
- Status: Active
- Context / Problem: Post Composer 항목은 제거 뒤 표시 순서가 바뀔 수 있다. 실패 순간 완성한 `1번째 이미지`
  문구를 상태에 저장하면 보이는 순서, alert와 재시도 accessible name이 서로 다른 대상을 가리킬 수 있다.
- Decision Outcome: consumer state가 UI에 전달할 실패 값은 안전한 stage/reason 의미를 유지하고, 현재 항목 순서나
  avatar/header label로 만든 `{subject}`는 render 시 공통 formatter와 결합한다. throw와 discriminated result 중
  전달 메커니즘은 구현자가 선택할 수 있지만 raw 외부 message를 UI 오류 상태로 보존하지 않는다.
- Alternatives Considered: 완성 문구를 실패 시점에 저장하는 방식은 subject가 stale해져 제외했다. component마다
  raw error를 다시 해석하는 방식은 분류·copy·보안 경계를 중복해 제외했다.
- Consequences: 항목 순서가 바뀌어도 보이는 문구와 accessible name이 현재 대상을 가리킨다. 각 consumer의 기존
  state 소유권과 stale guard는 유지되고 공통 formatter만 공유한다.
- Confirmation / Follow-up: Composer 항목 제거로 순서가 바뀐 뒤 오류 문구·재시도 name이 현재 index를 사용하고,
  Profile avatar/header subject가 서로 구분되는지 component test로 검증한다.

### 명시적 재시도는 새 Media와 URL로 실패 대상 전체 순서만 반복한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/media-upload-errors.md`, `docs/design/profile-edit.md`,
  `docs/domain/objects/media.md`, `PROD-657`, `PROD-553`, `PROD-492`
- Status: Active
- Context / Problem: 실패 원인을 구체화하면서 자동 retry나 signed URL 재사용까지 추가하면 기존 Media 생명주기와
  draft 보존 경계가 바뀌고 다른 Ready 항목을 불필요하게 재업로드할 수 있다.
- Decision Outcome: 사용자가 실행한 재시도만 실패 대상의 `issue → transfer → complete`를 새 Uploading Media와
  새 제한 URL로 반복한다. Composer preview/순서와 Profile draft·다른 Ready Media는 유지하고 자동 retry, 이전
  URL 재사용과 cleanup은 추가하지 않는다.
- Alternatives Considered: transfer만 반복하면 만료·부분 사용된 URL을 재사용할 수 있어 제외했다. 전체 화면의
  모든 Media를 재업로드하면 Ready 결과를 잃고 orphan을 늘려 제외했다. 자동 retry는 별도 backoff·취소·관측성
  계약 없이 현재 범위를 확대해 제외했다.
- Consequences: 실패 원인 안내는 개선되지만 orphan cleanup은 기존 제외 범위에 남는다. 두 consumer는 현재의
  item/field 단위 state ownership과 explicit retry를 유지한다.
- Confirmation / Follow-up: retry가 새 issue/URL을 사용하고 다른 Ready 결과와 현재 draft를 보존하는지 두 consumer
  회귀 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
