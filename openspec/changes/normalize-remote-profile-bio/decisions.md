## Context

이 기록은 `Profile.bio`의 canonical 평문 계약과 PROD-536의 remote actor `summary` 정규화·기존 데이터 정리 범위를 구현 전에 고정한다. 현재 remote Note projection, remote actor materialization/refresh, DB-only Profile 조회와 Local Profile outbound 경계를 독립적으로 대조했다.

## Decision Records

### Remote actor summary를 검증 전에 표시 가능한 평문으로 투영한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-536`
- Status: Active
- Context / Problem: actor `summary` 원문을 먼저 500자로 검증하면 HTML markup이 그대로 저장되거나, 표시 평문은 유효해도 markup 길이 때문에 bio가 유실된다.
- Decision Outcome: string 및 Fedify가 선택한 language-tagged `summary`를 표시 가능한 평문으로 먼저 투영하고, 그 결과에 `Profile.bio`의 trim·nullable·500자 검증을 적용한다. 최초 materialization과 refresh는 같은 경계를 사용하고 Local Profile 입력·outbound 표현은 변경하지 않는다.
- Alternatives Considered: raw HTML 저장 후 UI renderer 추가, 원문 길이 검증 후 tag 제거. 둘 다 PROD-536의 ingress 소유 경계와 평문 저장 결과를 만족하지 않는다.
- Consequences: DB, GraphQL과 모든 UI 소비자는 같은 평문 bio를 보며, 기존 raw markup을 기대한 비계약 소비 결과는 바뀐다.
- Confirmation / Follow-up: string/language-tagged insert, refresh, projection 후 길이, 비표시 내용, Local outbound 회귀를 각각 검증한다.

### 기존 ActivityPub HTML canonicalization 의미를 공유한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-536`
- Status: Active
- Context / Problem: Profile 전용 regex strip이나 새 sanitizer는 entity, block boundary, malformed markup과 script/style/template 처리 의미를 기존 remote Note 경계와 다르게 만들 수 있다.
- Decision Outcome: remote Note 수신에서 검증된 JSDOM→ProseMirror→Plain Text 의미를 remote Profile bio projection과 공유한다. helper 추출 여부와 내부 이름은 고정하지 않지만 두 진입점은 같은 parser 규칙과 회귀 fixture를 사용한다.
- Alternatives Considered: regex tag 제거, 신규 sanitizer dependency, frontend DOM/HTML renderer. 각각 malformed HTML·비표시 내용 처리, dependency/정책 중복 또는 저장 경계 미해결 문제가 있다.
- Consequences: 새 dependency 없이 기존 보안 fixture를 재사용하지만 PostContent parser 의미 변경은 Profile bio에도 영향을 줄 수 있으므로 공통 회귀 검증이 필요하다.
- Confirmation / Follow-up: entity, 링크 표시 텍스트, paragraph/hard break, malformed markup, unsafe URL, image와 script/style/template fixture를 pure projection test에서 고정한다.

### 기존 bio는 network-free bounded batch command로 정리한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-536`
- Status: Active
- Context / Problem: DB-only profile 조회와 요청 종속 7일 refresh는 기존 raw HTML row를 모두 정리했다는 완료 증거가 될 수 없으며, 원격 refetch는 instance 상태·rate limit·network 실패에 종속된다.
- Decision Outcome: 저장된 non-null ActivityPub Remote Profile bio를 같은 projection과 schema로 변환하는 one-shot command를 제공한다. stable identity cursor의 bounded batch, batch별 transaction, dry-run 및 scan/change/null/failure 합계, 변경값 비교와 재실행 0-change 수렴을 요구한다. Local Profile과 network fetch는 대상에서 제외한다.
- Alternatives Considered: TTL refresh 대기, 모든 actor 강제 refetch, SQL regex migration, 단일 전체-table transaction. 각각 완료 불확실성, 외부 I/O 위험, projection 의미 불일치 또는 운영 복구 경계 부재가 있다.
- Consequences: 알려진 raw HTML 저장값은 원격 가용성과 무관하게 정리할 수 있고 schema migration이 필요 없다. 이미 `null`로 유실된 원문은 복구하지 않으며 apply 후 exact raw HTML 복원에는 사전 backup이 필요하다.
- Confirmation / Follow-up: dry-run 무변경, ActivityPub Remote 한정, mixed changed/unchanged/null row, batch continuation, 실패 보고, apply 후 재실행 0-change를 DB test와 실행 결과로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
