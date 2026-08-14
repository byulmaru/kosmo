## Context

Kosmo의 분석 API는 공용 `trackAnalytics(name, properties?)` 경계와 Web 전용 OpenPanel client, Native no-op 모듈로 나뉜다. Session 경계는 opaque Account ID를 identify하고 로그아웃 뒤 identity를 clear한다. 현재 명시적 taxonomy는 Profile·Post·Follow·검색 행동만 포함하며 재게시·반응·북마크 호출부에는 분석 계측이 없다.

세 Post action은 공용 Post surface와 Action Bar를 거치지만 성공 판정은 서로 다르다. 재게시 생성·취소는 각 Relay mutation의 payload와 GraphQL 오류를 판정하고, Reaction은 authoritative payload가 있으면 부분 GraphQL 오류가 함께 있어도 성공으로 처리하며, Bookmark 생성·삭제는 각 payload와 기존 cache helper 결과를 사용한다. 새 계측은 이 성공 의미와 selected Profile별 Relay Environment를 바꾸지 않아야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 opaque Account identity에 연결되는 재게시·반응·북마크 event taxonomy를 구현한다.
- `reaction_type: default | custom`으로 현재와 향후 Reaction catalog를 저카디널리티로 분류한다.
- mutation의 서버 확정 성공 뒤 정확히 한 번 계측하고 실패와 분석 장애를 제품 흐름에서 격리한다.
- event property에서 대상과 콘텐츠 식별 정보를 제거한다.
- 관련 payload test와 production acceptance로 Account attribution과 개인정보 경계를 검증한다.

**Non-Goals:**

- Account 가입 성공 이벤트와 가입→최초 반응 funnel 계약 추가
- WAA 기간·제외 목록·순사용·dashboard query 같은 집계 계약 구현
- 구체 emoji별 분석, custom emoji 식별 정보 수집 또는 Reaction domain catalog 확장
- 재게시·반응·북마크 mutation, GraphQL schema, Relay cache 의미 변경
- Android·iOS 분석 지원 완료

## Implementation Guidance

### Current Constraints

- 공용 Post action 코드는 Web·Native가 함께 사용하므로 OpenPanel SDK를 action이나 controller에서 직접 import하면 Native bundle 경계를 깨뜨린다.
- 분석 helper는 실패를 흡수하는 fire-and-forget API다. mutation callback은 분석 완료를 기다리거나 분석 결과로 성공·실패를 다시 판단하지 않아야 한다.
- 재게시, Reaction, Bookmark는 서로 다른 payload 성공 의미를 가진다. 공통 GraphQL `errors.length === 0` 규칙으로 합치면 Reaction의 authoritative partial payload 계약을 깨뜨린다.
- Reaction UI는 현재 `❤️`, `🥹`, `🎉`, `👀`, `☘️`, `🌈`의 opaque canonical Type을 사용한다. 분석 분류는 이 값을 저장·전송하는 새 registry가 아니라 event 경계의 저카디널리티 projection이어야 한다.
- action은 요청을 시작한 Relay Environment와 pending/error 상태를 소유한다. 계측을 위해 callback 순서, actor 전환 격리, cache normalization 또는 toast/inline error를 바꾸면 안 된다.
- PROD-469에는 Account 가입 시점을 나타내는 이벤트가 없다. `profile_created`는 한 Account의 추가 Profile 생성에도 발생하므로 가입 이벤트로 재해석할 수 없다.

### Recommended Approach

기존 공용 analytics 경계를 유지하고 각 action이 이미 서버 성공을 확정하는 callback에서만 승인된 event name과 최소 property를 전달한다. 재게시 생성·취소는 같은 event와 `created | removed` result를 사용하고, Bookmark는 property 없이 별도 add/remove event를 사용한다. Reaction은 요청한 canonical Type을 `❤️`이면 `default`, 나머지는 `custom`으로 projection한 뒤 실제 Type을 버린다. 이 비교는 현재 catalog 전체를 열거하는 매핑보다 새 비기본 Type을 자동으로 `custom` 처리하므로 향후 확장에도 식별 정보가 노출되지 않는다.

호출부 test는 각 action의 성공, 취소, payload 부재·network 실패, 중복 입력 차단과 actor 격리를 유지하면서 event 호출 횟수와 exact payload를 검증한다. Reaction test는 authoritative payload와 부분 GraphQL 오류가 함께 있는 기존 성공 case도 계측해야 한다. 분석 client test는 새 taxonomy가 OpenPanel로 그대로 전달되고 SDK throw/reject가 제품 callback에 영향을 주지 않는지 확인한다.

`docs/operations/openpanel.md`의 명시적 event 목록과 production acceptance에는 opaque Account profile 아래 event attribution, allowlist property, 실패 mutation 비수집과 식별 정보 부재를 추가한다. 가입 cohort는 검증 항목으로 가장하지 않고 별도 계측 gap으로 남긴다.

### Allowed Alternatives

- Reaction 분류를 action 안에 인라인하거나 작은 pure projection으로 둘 수 있다. 어느 방식이든 `❤️`만 `default`, 나머지는 `custom`이어야 하고 실제 Type을 event property로 전달하지 않아야 한다.
- action별 성공 callback에서 직접 계측하거나 기존 완료 callback을 좁게 감쌀 수 있다. 어느 방식이든 기존 성공 판정·Relay 갱신·사용자 오류 처리 이후 정확히 한 번 실행되고 분석 실패를 격리해야 한다.

### Known Traps

- press, optimistic state 또는 mutation 요청 직후 계측하면 실패·취소와 중복 입력이 성공 행동으로 오염된다.
- 모든 GraphQL 오류를 실패로 취급하면 authoritative Reaction payload가 있는 기존 성공 계약과 어긋난다.
- Account 분석을 위해 Account ID나 selected Profile ID를 event property에 다시 넣으면 승인된 최소수집 경계를 위반한다.
- raw emoji, custom emoji ID·이름·shortcode를 `reaction_type` 또는 별도 property로 보내면 taxonomy가 고카디널리티 식별자로 변한다.
- `profile_created`를 가입 시점으로 사용하면 다중 Profile 생성 Account의 가입 funnel이 왜곡된다.
- 분석 실패를 toast, inline error, retry 또는 Sentry로 연결하면 제품 실패 의미와 재귀 telemetry를 만든다.

## Risks / Trade-offs

- [OpenPanel identity effect 전에 매우 이른 action이 발생하면 anonymous event가 될 수 있음] → Account ID property를 추가하지 말고 기존 Session identity 순서와 production Dashboard attribution을 검증한다. 실제 race가 확인되면 PROD-469 identity 계약 안에서 먼저 바로잡는다.
- [같은 사용자 재시도 또는 callback 중복으로 event가 과다 집계될 수 있음] → 기존 in-flight 차단과 mutation 결과당 한 번 호출을 action test에서 검증한다.
- [`default | custom`은 구체 emoji 선호를 분석할 수 없음] → 현재 제품 목적은 adoption 분류이며 구체 Type 분석은 별도 상위 계약이 승인될 때만 새 allowlist property로 확장한다.
- [분석 차단기·endpoint 장애로 일부 행동이 누락될 수 있음] → 분석은 best-effort로 유지하고 제품 mutation 가용성을 우선한다.

## Migration Plan

1. 기존 action 성공 경계에 승인된 event와 property projection을 연결하고 관련 test를 통과시킨다.
2. OpenPanel 운영 문서와 production acceptance를 갱신한다.
3. 기존 Web Client ID가 있는 build를 배포하고 opaque Account profile에서 각 add/remove event와 property를 확인한다.
4. event taxonomy나 attribution에 문제가 있으면 제품 mutation을 유지한 채 계측 호출을 되돌린 image로 rollback한다. DB·GraphQL·저장 데이터 migration은 없다.

## Open Questions

없음.
