## Context

PROD-628과 canonical Profile/Media 계약에 따라 Local ActivityPub actor가 최신 Profile 표현과 Follow Approval
Policy를 제공하는 범위를 기록한다. delta spec의 actor document 행동 계약과 design의 기존 actor/key 경계 재사용
접근을 반영한다.

## Decision Records

### Local Profile의 현재 공개 표현을 canonical Person에 투영한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-628`
- Status: Active
- Context / Problem: Local Profile은 displayName, bio, avatar/header와 Follow Approval Policy를 소유하지만 기존
  actor document는 avatar/header와 policy를 제공하지 않아 원격 consumer가 최신 공개 표현을 얻을 수 없다.
- Decision Outcome: `Person.name`은 displayName, 평문 `summary`는 bio, Ready Local avatar는 `icon`, Ready
  Local header는 `image`로 제공한다. Follow Approval Policy는 `APPROVAL_REQUIRED=true`, `OPEN=false`의
  `manuallyApprovesFollowers`로 제공한다.
- Alternatives Considered: 기존 최소 actor 문서를 유지하거나 이미지와 policy를 outbound Update에서만
  제공하는 방안. actor 역참조 자체가 불완전하게 남고 같은 actor identity가 caller에 따라 다른 표현을 가지므로
  채택하지 않는다.
- Consequences: actor 역참조만으로 현재 저장된 Local Profile 표현을 읽을 수 있다. Profile Tag·Profile Link와
  outbound delivery는 이 결정의 범위가 아니다.
- Confirmation / Follow-up: actor HTTP 응답에서 값 존재·부재, policy 양방향과 기존 identity·endpoint·key
  보존을 검증한다.

### ActivityPub 이미지는 저장된 유효한 Ready Local Media만 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-628`
- Status: Active
- Context / Problem: ProfileMedia 관계만으로 Uploading/Remote/다른 Profile Media 또는 공개 metadata가 없는
  Media까지 actor에 노출하면 Profile 조회 정책과 Media Storage Service 경계를 우회할 수 있다.
- Decision Outcome: actor projection은 같은 Profile이 소유한 Source=Local, State=Ready Media의 저장 URL과
  Media Type만 사용하고, 조건을 만족하는 선택 Media가 없으면 `icon`/`image`를 제공하지 않는다.
- Alternatives Considered: storage reference에서 URL 재조립, placeholder 사용, 관계가 있으면 Media 상태와
  무관하게 노출. 모두 저장 서비스의 공개 표현 권위나 선택값 부재 계약을 위반하므로 채택하지 않는다.
- Consequences: 잘못되거나 불완전한 선택 Media는 actor document 전체를 위한 대체 표현이 되지 않으며 노출되지
  않는다. DB migration이나 Media backfill은 필요하지 않다.
- Confirmation / Follow-up: Local/Ready/소유권/metadata 조건과 avatar/header 제거 뒤 stale 값 부재를
  통합 테스트로 검증한다.

### 모든 local actor caller가 Fedify vocabulary projection을 공유한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `PROD-628`
- Status: Active
- Context / Problem: actor HTTP dispatcher와 후속 outbound Update가 각각 JSON 또는 `Person`을 조립하면 필드,
  identity, key와 선택값 처리 규칙이 갈라질 수 있다.
- Decision Outcome: 저장 Profile/Media projection을 Fedify `Person`과 `Image` vocabulary object로 만드는 기존
  local actor 생성 경계를 확장해 caller들이 재사용할 수 있게 한다. 내부 JSON shape를 별도로 만들지 않는다.
- Alternatives Considered: actor dispatcher 전용 inline JSON, outbound 전용 projection 복제. 현재도 Fedify가
  JSON-LD와 key 직렬화를 소유하며 중복 경계가 실제 호환성 위험을 만들기 때문에 채택하지 않는다.
- Consequences: actor identity, endpoint, key와 Profile 표현이 하나의 생성 경계에서 함께 유지된다. 구체 DB
  join 방식과 내부 타입 이름은 고정하지 않는다.
- Confirmation / Follow-up: actor HTTP 통합 테스트와 `Person` projection 테스트에서 동일한 저장 입력이 같은
  표현을 만드는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
