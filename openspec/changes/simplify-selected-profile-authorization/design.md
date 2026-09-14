## Context

현재 selected Profile 계약은 Account-Profile Membership으로 선택 자격을 정한 뒤에도 일부 Core/GraphQL 경계에서
Profile Origin 또는 `InstanceKind.LOCAL`을 다시 확인한다. active OpenSpec에는 Local-only 또는 인위적인
Remote-selected Post 성공 시나리오도 남아 있다. PROD-962는 선택 자격을 Membership 하나로 정리하고, 선택된
actor를 소비하는 세 가지 후보 action의 중복 조건과 그 조건만을 증명하는 테스트를 정리하는 변경이다.

## Goals / Non-Goals

**Goals:**

- Profile 선택 계약을 Account-Profile Membership 존재 하나로 일치시킨다.
- 선택 경계에서 Origin/Instance Kind, Account Profile Role, Profile creator를 권한 조건으로 재검사하지 않는다.
- Profile update, profile mute owner, unfollow follower의 selected-actor Local guard와 인위적인 Remote-selected
  테스트를 제거할 수 있도록 구현·검증 기준을 정리한다.
- Post와 관련 active OpenSpec에서 selected Profile의 Local/Remote capability 약속을 제거한다.
- Target, source, recipient, federation delivery와 protocol-origin처럼 action 의미에 필요한 Local/Remote 분기는
  보존한다.

**Non-Goals:**

- Remote Profile Membership 생성·materialization·지원·금지 capability를 추가하지 않는다.
- Account-Profile Membership schema, Role model, GraphQL shape, visibility policy를 변경하지 않는다.
- 선택된 actor가 아닌 대상 Profile/Media/Post의 origin, source, recipient 또는 federation 정책을 단순화하지 않는다.
- archived OpenSpec history를 수정하지 않는다.

## Implementation Guidance

### Current Constraints

GraphQL `usingProfile`/session context와 `selectProfile` 경계가 Active Account, Membership 및 selected Profile의
공통 조회 가능 상태를 확인한다. 그 결과를 소비하는 Core action은 검증된 Profile identity와 action input만 받아야
하며 공통 선택 자격을 다시 조립하면 계약이 중복된다. 다만 Profile update의 운영 권한, profile mute의 owner
관계, unfollow의 follower 관계와 같은 action 고유 조건은 계속 필요하다.

`InstanceKind.LOCAL`을 제거할 때 selected actor와 대상·source·recipient를 혼동하면 안 된다. Post 저장 위치,
Media source, Follow/Follow Request origin·delivery 및 protocol ingress의 Local/Remote 조건은 이 변경의 선택
권한과 별개다. Remote membership이 현재 생성되지 않는다는 사실도 테스트에서 Remote capability를 보장하거나
거부하는 근거로 사용하지 않는다.

### Recommended Approach

먼저 새 profile/post delta spec과 canonical 문서를 기준으로 selected actor를 소비하는 세 후보 action의 권한
경계를 확인한다. 이미 upstream에서 membership과 공통 visibility가 검증된 selected actor에 한해 중복
`InstanceKind.LOCAL` 조건을 제거하고, 그 조건만을 증명하던 인위적인 Remote-selected fixture·scenario를
삭제한다. action 고유의 owner/follower 관계, 상태, 대상과 transaction 검증은 그대로 둔다.

각 action에 대해 성공·membership/관계 실패·공통 조회 실패를 관찰하는 focused test를 유지하고, 테스트는
Profile origin을 선택 권한으로 다시 확인하지 않는 결과를 검증한다. 이후 active post delta의 Remote-selected
성공 약속만 제거하고, strict OpenSpec 검증과 해당 focused test를 실행한다.

### Allowed Alternatives

구현자는 동일한 결과를 보장하는 범위에서 selector/context가 반환하는 검증된 identity의 표현이나 테스트 fixture
구조를 조정할 수 있다. 다만 대안은 Membership-only 선택 자격, common visibility 경계, action 고유 조건과
keep-list를 모두 보존하고 별도 schema나 Remote capability를 도입하지 않아야 한다.

### Known Traps

- selected actor의 origin guard를 제거한다는 이유로 target/source/recipient의 origin guard까지 삭제하지 않는다.
- Member와 Owner의 운영 권한을 selected Profile 선택 자격으로 재사용하지 않는다.
- Remote-selected 성공 테스트를 남겨 Remote 선택 capability를 약속하거나, 반대로 Remote를 명시적으로 거부해
  금지 capability를 만들지 않는다.
- 이미 `usingProfile`이 검증한 membership·visibility를 action마다 다시 조회하는 새 helper를 추가하지 않는다.
- source/target visibility 또는 federation delivery 검증을 Membership-only 규칙으로 대체하지 않는다.

## Risks / Trade-offs

- [중복 Local guard 제거 후 action의 필수 운영·관계 조건이 함께 약화될 위험] → 세 후보 action별 owner/follower,
  상태·대상 검증을 focused test와 diff에서 별도로 확인한다.
- [active spec의 capability 문구가 다른 변경과 충돌할 위험] → 현재 active 변경의 post delta만 정정하고 archived
  history는 건드리지 않으며 strict validation 결과를 기록한다.
- [현재 Remote membership 생성 경로 부재를 제품 계약으로 오해할 위험] → spec과 decision에 Remote 지원·금지를
  정의하지 않는다는 문구를 명시한다.

## Migration Plan

DB migration이나 데이터 backfill은 없다. canonical 문서와 active OpenSpec을 먼저 정정한 뒤 GraphQL/Core 구현과
focused test를 적용한다. 배포 후 selected actor action에서 membership, visibility, action 고유 권한과 결과를
확인한다. 문제가 발생하면 해당 구현 commit을 되돌리되 canonical/OpenSpec 정정은 별도 검토 없이 되돌리지 않는다.

## Open Questions

없음.
