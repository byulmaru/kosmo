## Context

이 기록은 최신 Linear PROD-539의 Account 단위 분석 목적·event taxonomy·개인정보 경계, 적용되는 Post·Reaction·Bookmark canonical 문서와 현재 OpenPanel identity·운영 계약을 proposal, specs와 design에 반영한 결과를 구속력 있는 선택과 blocked upstream gap으로 구분한다.

## Decision Records

### Post 상호작용 이벤트는 기존 opaque Account identity를 재사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/openpanel.md`, Linear `PROD-469`, Linear `PROD-539`
- Status: Active
- Context / Problem: distinct Account, cohort와 retention을 계산하려면 행동을 Account에 연결해야 하지만 event property에 식별자를 반복하면 최소수집 경계를 넓힌다.
- Decision Outcome: 기존 OpenPanel opaque Account ID identify 생명주기를 그대로 사용한다. Account ID, 대상·선택 Profile ID와 대상 Post ID는 PROD-539 event property에 넣지 않는다.
- Alternatives Considered: Account ID를 모든 event property에 복제하는 방법은 중복 수집이고, 모든 식별자를 제거해 anonymous event만 만드는 방법은 승인된 Account 단위 분석을 할 수 없어 제외했다.
- Consequences: OpenPanel identity가 현재 Account의 여러 행동을 묶어 distinct 사용·빈도·cohort·retention 분석 기반을 제공한다. 지표의 기간·분모·내부 Account와 봇 제외는 PROD-520이 별도로 소유한다.
- Confirmation / Follow-up: production Dashboard의 opaque Account profile에서 새 이벤트 attribution을 확인하고 payload에는 Account·Post·Profile ID가 없는지 검증한다.

### 재게시 생성·취소는 하나의 성공 event와 result로 구분한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, Linear `PROD-539`
- Status: Active
- Context / Problem: PROD-539의 승인된 이름은 `repost_succeeded` 하나이지만 생성과 취소를 모두 Account 행동으로 분석해야 한다.
- Decision Outcome: 생성·취소 모두 `repost_succeeded`를 사용하고 `result: "created" | "removed"`로 결과를 구분한다.
- Alternatives Considered: `repost_removed`를 새 이벤트로 추가하는 방법은 승인된 taxonomy 밖이고, 취소를 수집하지 않는 방법은 전달 결과와 완료 조건을 충족하지 못해 제외했다.
- Consequences: event 하나로 재게시 adoption과 취소 행동을 함께 분석할 수 있으며 Post·Repost ID는 필요하지 않다.
- Confirmation / Follow-up: 생성·취소 성공과 실패 test에서 exact event name, result와 호출 횟수를 확인한다.

### Reaction은 구체 Type 대신 default와 custom으로 분류한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/design/reactions.md`, Linear `PROD-539`
- Status: Active
- Context / Problem: 기본·커스텀 반응 adoption을 장기간 비교해야 하지만 현재 여섯 Unicode 값을 analytics allowlist로 고정하면 catalog 확장 때 taxonomy가 변하고 custom emoji 식별자가 유출될 수 있다.
- Decision Outcome: `reaction_added`와 `reaction_removed`는 `reaction_type: "default" | "custom"`만 보낸다. 현재 `❤️`만 `default`, 나머지 canonical Type은 `custom`이다. 향후 canonical catalog의 새 Type과 custom emoji도 별도 기본 반응으로 승인되지 않으면 실제 식별 값을 버리고 `custom`으로 분류한다.
- Alternatives Considered: 여섯 Unicode 값을 그대로 보내는 방법과 `reaction_value`를 별도 allowlist로 추가하는 방법은 현재 제품 목적에 불필요한 구체 선호 정보와 확장 비용을 만들고, custom emoji ID·이름·shortcode 수집은 개인정보 경계를 넓혀 제외했다.
- Consequences: default/custom distinct Account와 retention은 안정적으로 계산할 수 있지만 구체 emoji별 사용률은 알 수 없다. 구체 Type 분석이 필요해지면 별도 상위 계약과 최소 allowlist property 승인이 필요하다.
- Confirmation / Follow-up: 현재 여섯 Type 전체의 projection, add/remove exact payload와 raw Reaction 값 부재를 검증한다.

### 각 action의 기존 서버 확정 성공 의미를 계측 경계로 사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `docs/design/reactions.md`, Linear `PROD-469`, Linear `PROD-539`
- Status: Active
- Context / Problem: mutation 요청·optimistic state·공통 GraphQL 오류 규칙에서 계측하면 제품이 확정한 실제 결과와 event가 달라질 수 있다.
- Decision Outcome: 재게시·Reaction·Bookmark 각각의 기존 action 계약이 서버 결과를 성공으로 확정한 뒤에만 대응 event를 한 번 기록한다. Reaction은 authoritative payload가 있으면 부분 GraphQL 오류가 함께 있어도 기존 계약대로 성공이고, payload 부재와 network 실패는 성공 event를 만들지 않는다. 분석 실패는 제품 결과와 오류 처리를 바꾸지 않는다.
- Alternatives Considered: press 또는 요청 시작 시점 계측, 모든 GraphQL 오류를 일괄 실패 처리, 분석 완료를 mutation 성공 조건으로 기다리는 방법은 각각 데이터 오염, Reaction 계약 위반 또는 제품 가용성 저하 때문에 제외했다.
- Consequences: 분석은 제품의 server-confirmed 상태와 일치하지만 endpoint 장애 때 일부 event가 누락될 수 있다. 가용성을 위해 이 누락을 수용한다.
- Confirmation / Follow-up: action별 성공·실패·partial payload·SDK throw/reject와 actor 격리 test를 통과시킨다.

### Account 가입 이벤트를 현재 범위에 추가하지 않고 계측 gap으로 유지한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/openpanel.md`, Linear `PROD-469`, Linear `PROD-539`
- Status: Active
- Context / Problem: 가입 Account 대비 반응 adoption, 가입 뒤 최초 반응 비율과 정확한 time-to-first-reaction은 신뢰할 수 있는 Account 가입 시점이 필요하지만 PROD-469에는 해당 event가 없다. `profile_created`는 같은 Account의 추가 Profile 생성에도 발생한다.
- Decision Outcome: PROD-539은 `account_signed_up` 등 가입 event를 추가하거나 기존 event를 가입 시점으로 재해석하지 않고, 가입 cohort와 time-to-first-reaction이 현재 계산 불가능하다는 계측 gap만 기록한다. 향후 실제 도입 시 Account 가입 성공 경계, taxonomy, 재시도·중복 의미와 기존 Account backfill 정책을 별도 상위 제품 계약에서 승인한다.
- Alternatives Considered: `profile_created`, 최초 identify 또는 최초 pageview를 가입 시점으로 대체하는 방법은 가입과 다른 사건이며 기존 Account를 왜곡하므로 제외했다.
- Consequences: WAA 기반 반응 adoption과 Account별 빈도·retention은 가능하지만 가입 cohort와 time-to-first-reaction은 현재 PROD-469/539만으로 계산할 수 없다. 이 gap은 현재 change의 구현·완료·archive를 막지 않는다.
- Confirmation / Follow-up: 운영 문서와 handoff에 현재 계산 불가능 범위를 기록한다. 해당 funnel을 실제 운영하기로 결정하면 upstream owner가 가입 event와 historical cohort 정책을 먼저 승인하고 Linear·canonical·OpenSpec 순서로 갱신한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
