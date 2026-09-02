## Context

현재 앱의 공통 순서 helper는 `issueMediaUploadUrl → signed PUT → completeMediaUpload`과 stale 결과 차단을
소유하지만, Post Composer와 Profile 편집이 Relay mutation과 PUT callback을 각각 조립한다. 두 PUT callback은
`Response.ok`만 확인하고 non-2xx status/body를 버린 뒤 서로 다른 generic `Error`를 던진다. 그 결과 UI는
`issue`, `transfer`, `complete` 실패와 Storage Service의 machine-readable 원인을 구분할 수 없다.

Media Storage Service의 현재 PUT 계약은 `415` format, `413` byte limit, `422` image validation code와
`{ error: { code, message } }` body를 제공한다. Kosmo는 이 서비스의 byte 검증·변환을 중복 구현하지 않으며 raw
message를 신뢰하거나 표시해서도 안 된다. 기존 Composer active guard, Profile field generation, 실패 preview와
Ready Media 보존, 새 URL 재시도 의미는 유지해야 한다.

## Goals / Non-Goals

**Goals:**

- 실패 단계와 allowlisted status/code를 하나의 공통 client 분류로 변환한다.
- 두 consumer가 같은 안전한 문구와 구조화된 오류를 사용하면서 기존 draft 보존·재시도 의미를 유지한다.
- 오류 response parsing 실패가 원래 실패를 가리거나 외부 원문 노출로 이어지지 않게 한다.
- 순수 분류 테스트와 consumer 회귀 테스트로 정상·알려진 code·network/unknown·접근성 경계를 검증한다.

**Non-Goals:**

- Media Storage Service, GraphQL schema/resolver, Media state나 persistence를 변경하지 않는다.
- 자동 retry/backoff, upload 취소, orphan 정리, HEIC 변환, request ID·구조화 로그를 추가하지 않는다.
- 기존 Web 출시 gate를 Android·iOS 실제 기기 완료 증거로 확대하지 않는다.

## Implementation Guidance

### Current Constraints

- `apps/app/src/components/post/postComposerMedia.ts`의 순서 helper는 callback 실패를 그대로 전파하고 active 여부만
  확인한다. 단계별 catch가 없으므로 같은 `Error`만으로 실패 단계를 복원할 수 없다.
- `PostComposerMediaControls.tsx`와 `ProfileEditRoute.tsx`가 issue/PUT/complete callback을 중복 조립하며, 두 PUT
  경로 모두 body를 읽지 않는다.
- Composer는 항목의 `uploading | ready | failed` state와 현재 배열 순서를, Profile은 field별 generation과
  local asset을 소유한다. 공통화 과정에서 이 소유권을 새 전역 store로 옮기면 stale 결과 차단이 약해진다.
- Composer의 선택 순서는 제거 후 바뀔 수 있다. 실패 시점에 `1번째 이미지` 같은 완성 문구를 저장하면 현재
  accessible name과 어긋날 수 있다.
- Storage Service code는 이 저장소의 공개 TypeScript dependency가 아니다. 새 code가 추가돼도 Kosmo는 배포
  순서를 강하게 결합하지 않고 unknown fallback을 유지해야 한다.

### Recommended Approach

1. 앱 공통 upload 경계에 `stage`와 `reason`만 노출하는 구조화된 오류를 둔다. 순서 helper가 issue/transfer/complete
   callback을 각각 감싸 stage를 확정하고, transfer callback은 non-2xx `Response`를 공통 classifier에 전달한다.
2. classifier는 `2xx`를 즉시 성공 처리하고 non-2xx body만 best-effort JSON으로 읽는다. status와 안전한
   `error.code` allowlist가 함께 일치할 때만 네 원인으로 세분하고, network·`5xx`·malformed·unknown은
   `transient`로 반환한다. `error.message`와 나머지 body는 구조화된 UI 오류에 복사하지 않는다.
3. 오류 상태에는 완성된 외부/사용자 문구 대신 `stage/reason`을 저장한다. 각 render가 현재 배열 순서 또는
   avatar/header label로 안전한 `subject`를 만들고 공통 formatter를 통해 canonical 한국어 문구와 accessible
   name을 생성한다.
4. 기존 Composer active guard와 Profile generation/asset guard는 그대로 유지한다. 명시적 retry는 현재처럼
   실패 대상의 전체 순서를 새 issue 요청부터 실행하고 다른 Ready 결과를 건드리지 않는다.
5. 공통 classifier/formatter에는 table-driven unit test를 두고, 순서 helper에는 단계 attribution과 새 URL
   retry를 검증한다. 두 consumer test는 같은 분류가 보이는 문구·alert·재시도 accessible name으로 연결되고
   draft/Ready 결과가 보존되는지 검증한다.

이 접근은 중복된 network callback 전체를 한 컴포넌트나 전역 store로 합치지 않고, 공통이어야 하는 transport
해석과 copy만 공유하므로 현재 React/Relay 소유권과 stale guard를 보존한다.

### Allowed Alternatives

- 순서 helper가 typed error를 throw하는 대신 discriminated result를 반환해도 된다. 다만 성공/실패 타입에서
  stage/reason이 누락되지 않고 기존 inactive `null` 결과와 혼동되지 않아야 한다.
- Post와 Profile의 Relay mutation callback 조립을 더 넓은 hook으로 공통화해도 된다. 두 consumer의 state
  소유권, active/generation guard와 specs의 독립 재시도 의미가 동일하게 검증되는 경우에만 허용한다.

### Known Traps

- code만 보고 분류하거나 status만 보고 사용자 원인을 추측하면 예상하지 않은 서비스 응답을 구체적 사용자
  오류로 잘못 표시한다.
- non-2xx에서 `response.json()` 실패를 다시 throw하면 malformed/empty body가 transient fallback을 우회한다.
- raw `Error.message`를 formatter 입력으로 허용하면 Storage Service·GraphQL 내부 detail이 UI에 도달할 수 있다.
- 오류에 완성된 항목 번호 문구를 저장하면 Composer 항목 제거 뒤 보이는 순서와 accessible name이 stale해진다.
- transient 오류를 자동 retry하거나 이전 signed URL을 재사용하면 기존 새 Media/URL retry 계약과 orphan 경계를
  바꾼다.
- 모든 code 조합을 component/E2E에서만 검증하면 transport 분류 실패와 UI 연결 실패의 경계를 찾기 어렵다.

## Risks / Trade-offs

- [외부 서비스가 새로운 안전한 code를 추가해도 일시적 실패로만 보인다] → unknown fallback을 유지하고 새 원인
  노출이 필요할 때 canonical/Linear 계약과 allowlist를 함께 갱신한다.
- [응답 body parsing이 실패 경로의 비용을 늘린다] → non-2xx에서만 작은 JSON shape를 best-effort로 읽고 parsing
  실패를 즉시 transient로 접는다.
- [공통 typed error 도입 중 기존 inactive/stale 흐름이 실패 UI로 바뀔 수 있다] → 제거/unmount/generation guard의
  기존 `null`/ignore semantics를 유지하는 회귀 테스트를 먼저 고정한다.
- [원인별 문구가 service 제한과 drift할 수 있다] → 16 MiB와 지원 형식은 canonical 디자인과 service 계약을 함께
  provenance로 두고, unknown service 변경은 구체 문구로 추측하지 않는다.

## Migration Plan

1. 공통 오류 분류·문구와 순서 helper의 단계 attribution을 unit test와 함께 추가한다.
2. Post Composer를 공통 오류에 연결하고 기존 item 보존·retry·remove/a11y 테스트를 갱신한다.
3. Profile 편집을 같은 오류에 연결하고 field draft·다른 Ready field·save 차단/a11y 테스트를 갱신한다.
4. Relay compile, app check/test, Storybook과 필요한 Web runtime upload 실패 흐름을 검증한다.
5. client-only 변경으로 배포하며 데이터 backfill이나 순차 schema rollout은 없다. 문제가 생기면 앱 변경을
   되돌려 기존 generic fallback으로 복구할 수 있고 Media Storage Service와 저장 데이터는 영향을 받지 않는다.

## Open Questions

없음. 현재 allowlist 밖의 status/code는 계약대로 transient로 처리하며 새 제품 원인이 필요해질 때 별도 upstream
결정으로 연다.
