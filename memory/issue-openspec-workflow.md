# Issue -> OpenSpec -> Implementation 워크플로

## 목적

Kosmo 기능 개발은 다음 순서를 기본으로 한다.

```text
Canonical 도메인·디자인 문서
  -> Linear 이슈 구조
  -> OpenSpec
  -> 구현
  -> 검증과 archive
```

- Linear는 작업이 필요한 이유, 전달 결과, 우선순위, 범위, 소유권과 의존성을 정의한다.
- OpenSpec은 승인된 이슈를 요구사항, 설계, 결정과 검증 가능한 구현 작업으로 구체화한다.
- 구현은 이슈와 OpenSpec을 실행한다. OpenSpec을 backlog 작업이 처음 발견되거나 조용히 확장되는 장소로
  사용하지 않는다.

적용되는 `docs/domain`과 `docs/design` 문서는 해당 영역의 canonical source다. Linear와 OpenSpec은 이를
재정의하지 않고 참조한다.

## 책임 경계

| 단위            | 소유하는 것                                                | 소유하지 않는 것                 |
| --------------- | ---------------------------------------------------------- | -------------------------------- |
| Project         | 장기 제품 영역, 우선순위, milestone                        | 하나의 영구적인 OpenSpec change  |
| Milestone       | 독립적으로 전달할 수 있는 제품 단계                        | 세부 행동 계약과 구현 설계       |
| 계약 이슈       | 하나의 닫힌 결과, 범위, 제약, 완료 조건, OpenSpec 생명주기 | 모든 구현을 한 PR에 담는 책임    |
| OpenSpec 이슈   | 여러 PR이 공유하는 계약의 spec-only 브랜치와 PR            | 제품 우선순위와 구현 코드        |
| 구현 이슈       | 리뷰 가능한 구현 결과 하나, 브랜치, PR, 검증 증거          | 공유 계약을 복제한 별도 OpenSpec |
| OpenSpec change | 요구사항, 설계, durable decision, 구현 체크리스트          | Linear 우선순위와 이슈 계층      |
| PR              | 해당 이슈가 소유한 OpenSpec 또는 구현 결과                 | Project 전체 backlog             |

작은 변경은 하나의 이슈가 계약 이슈와 구현 이슈 역할을 함께 가질 수 있다. 여러 PR이 필요한 변경은 계약
부모, OpenSpec 이슈 하나, 구현 자식 이슈들로 나눈다.

## Project와 Milestone 선택

- Project는 여러 독립 계약의 backlog와 우선순위를 장기간 관리할 실제 제품 영역일 때만 사용한다.
- Milestone은 필수 계층이 아니다. 여러 계약 이슈를 하나의 목표 시점과 통합 완료 조건으로 함께 전달할 때만
  생성하거나 재사용한다.
- 이슈 하나가 Project에 속한다고 해서 반드시 Milestone에도 속할 필요는 없다.
- 기존 Milestone은 이름이나 존재만으로 현재 계획의 source of truth가 아니다. 실제 출시 목표와 owner가 없는
  분류, 오래된 계획 또는 자동 생성된 항목은 관성적으로 재사용하지 않는다.
- 기능 유형을 나열하기 위한 분류가 필요하면 계약 이슈와 관계를 사용한다. 그 분류만을 위해 Milestone을 미리
  만들지 않는다.

## OpenSpec 경계 선택

OpenSpec은 이슈, PR, 담당자, package 또는 디렉터리 수가 아니라 **함께 결정하고 검증하고 전달해야 하는
행동 계약 묶음**을 기준으로 나눈다.

다음 조건이면 하나의 OpenSpec으로 묶는다.

- 하나의 사용자 또는 시스템 결과를 함께 완성한다.
- 같은 요구사항, 정책 결정과 rollout 판단을 공유한다.
- 일부 구현 계층만 배포하면 완료 조건을 만족하지 못한다.
- 하나의 통합 검증 결과가 필요하다.

다음 조건이면 별도 OpenSpec으로 나눈다.

- 각각 독립적으로 승인, 구현, 검증, 연기 또는 출시할 수 있다.
- blocker, 위험, rollout 시점 또는 완료 조건이 다르다.
- 서로 다른 행동 계약과 결정을 소유한다.
- 관련 없는 선행 작업을 기다리느라 하나의 change가 장기간 active로 남는다.

DB, API, client, test가 서로 다른 PR이라는 이유만으로 OpenSpec을 나누지 않는다. 반대로 Project나
Milestone 전체를 하나의 무기한 active change에 넣지 않는다.

```text
작은 변경
계약·구현 이슈 -> OpenSpec -> 구현 PR

여러 PR이 필요한 변경
계약 부모
  -> OpenSpec 이슈와 spec-only PR
  -> 구현 이슈와 구현 PR들

장기 제품 영역
Project / Milestone
  -> 계약 이슈 A -> OpenSpec A -> 구현
  -> 계약 이슈 B -> OpenSpec B -> 구현
```

## 1. Issue Gate

OpenSpec change를 만들기 전에 Linear 이슈 구조가 먼저 존재해야 한다.

계약 이슈에는 다음 내용을 기록한다.

- 현재 문제와 근거
- 전달할 사용자 또는 시스템 결과
- 포함 범위와 제외 범위
- 적용되는 canonical 도메인·디자인 문서
- 변경할 수 없는 제품, 보안, 호환성 제약
- blocker, 후속 작업과 병렬 작업 경계
- 개발자 관점의 전달 순서와 단계별 검증 gate
- 결과 수준의 완료 조건
- 이슈 범위를 바꾸는 질문과 OpenSpec에서 정밀화할 질문

테이블 shape, GraphQL payload, 함수, 컴포넌트, migration 방식과 파일별 작업은 기존 공개 계약이 이미
고정한 경우가 아니라면 이 단계에서 확정하지 않는다.

여러 PR이 필요한 변경은 OpenSpec 착수 전에 구현 자식 경계를 생성하거나 최소한 초안으로 정리한다.
OpenSpec 이슈는 spec-only PR이 merge될 때까지 구현 자식들을 block한다.

## 2. OpenSpec Gate

OpenSpec은 저장소의 `spec-driven-decisions` schema를 따른다.

- `proposal.md`: Linear 이슈를 영향받는 capability와 repository impact로 번역한다.
- `specs/**/spec.md`: 규범적이고 검증 가능한 행동을 정의한다.
- `design.md`: 현재 구현 제약, 비규범적 권장 접근, 허용 가능한 대안과 알려진 함정, 위험, migration과 rollback을 설명한다.
- `decisions.md`: 구현자가 반드시 지켜야 하는 durable choice, 대안, 결과와 남은 결정을 기록한다. 파일명, 함수, helper나 자료구조는 장기 호환성·보안·rollout 또는 여러 구현 slice가 정확한 선택을 공유해야 할 때만 고정한다.
- `tasks.md`: 승인된 구현 이슈를 의존 순서의 검증 가능한 작업으로 구체화한다. 각 task group은 결과 수준의 Deliverable, specs·공개 계약·accepted decision에서 파생한 Guardrails, 완료를 증명할 Verification을 checkbox와 분리해 제공한다.

proposal은 계약 이슈를 링크한다. 공유 change의 task heading은 이미 존재하는 구현 이슈를 식별한다.

```md
## 1. PROD-123 Notification read path

**Deliverable**

권한이 있는 Recipient가 Notification을 읽고 최초 읽음 시각을 유지한다.

**Guardrails**

- 권한이 없는 Recipient에게 존재 여부를 노출하지 않는다.

**Verification**

- 최초·반복 Read와 권한 실패를 검증한다.

- [ ] 1.1 ...
- [ ] 1.2 ...

## 2. PROD-124 Notification client flow

**Deliverable**

클라이언트가 읽음 결과를 올바른 Recipient cache에 반영한다.

**Guardrails**

없음.

**Verification**

- Profile 전환과 Read 뒤 cache 격리를 검증한다.

- [ ] 2.1 ...
```

`design.md`의 Recommended Approach는 구현자가 안전하게 시작하기 위한 기본 경로이지 규범적 계약이 아니다.
구현자는 specs, accepted decisions, Deliverable, Guardrails와 Verification을 모두 만족하면 Allowed Alternatives나
동등한 방식을 선택할 수 있다. 권장 접근을 task checkbox에 복제해 내부 구현 수단으로 고정하지 않는다.

`tasks.md`는 숨은 backlog가 아니다. OpenSpec 작업 중 독립적으로 전달할 결과가 발견되면 작업을 멈추고
Linear 이슈를 먼저 생성하거나 분리한 뒤 OpenSpec을 갱신한다.

다음 조건을 모두 만족한 뒤 구현을 시작한다.

- Linear와 OpenSpec의 목표와 범위가 일치한다.
- 필요한 specs, design, decisions, tasks가 존재한다.
- 이슈 분리나 계약 경계를 바꿀 미결정 사항이 없다.
- tasks가 구현 소유권과 의존 순서에 대응한다.
- `openspec validate <change> --strict`가 통과한다.

여러 PR이 공유하는 change는 OpenSpec-only PR을 먼저 merge한다.

## 3. Implementation Gate

- 하나의 구현 브랜치와 PR은 하나의 Linear 구현 이슈에 대응한다.
- 구현 이슈는 계약 부모와 OpenSpec change를 링크한다.
- PR은 담당 이슈의 결과와 검증 범위만 소유한다.
- 구현은 이슈, specs, design과 accepted decisions를 함께 만족해야 한다.
- 구현자는 design의 Current Constraints와 Known Traps를 확인하고 Recommended Approach를 기본 경로로 검토한다.
  다른 접근도 Deliverable, Guardrails, Verification, specs와 accepted decisions를 모두 만족하면 허용한다.
- 다른 접근이 범위, 관찰 가능한 행동, 공개 계약 또는 durable decision을 바꾸면 구현을 멈추고 Linear와 OpenSpec을
  먼저 갱신한다.
- 행동이나 범위가 바뀌면 Linear, OpenSpec, 코드 순서로 갱신한다.
- 계획·구현 중 accepted decision으로 정해지지 않은 중요한 선택이 필요하면 AI는 대안과 trade-off를 비교해
  제시할 수 있지만, 최종 선택과 이유는 사람이 결정하도록 멈춘다. 관찰 가능한 행동, 데이터, 보안, 호환성,
  rollout, 가역성 또는 후속 구현 방향에 영향을 주며 실질적인 대안이 있었던 선택을 중요한 결정으로 본다.
- 구현 PR을 열거나 갱신하기 전에 구현 중 실제로 확정된 중요한 결정을 식별한다. AI는 이미 확정된 선택과
  이유를 바탕으로 PR 결정문을 작성할 수 있지만, 근거가 없거나 불명확한 선택과 이유를 추론해 만들지 않고
  결정한 사람에게 확인한다.
- PR에는 중요한 구현 결정의 선택, 고려한 대안, 이유와 감수한 결과를 기록한다. 새로 내린 중요한 결정이
  없다면 accepted OpenSpec decision을 그대로 적용했음을 명시하며 형식적인 결정을 만들지 않는다.
- accepted durable decision은 PR에 전문을 복제하지 않고 링크와 적용 결과를 남긴다. 구현 중 새로운 durable
  decision이 필요해지면 PR 본문에만 기록하지 않고 Linear와 OpenSpec을 먼저 갱신한다.

새로 발견한 작업은 다음처럼 처리한다.

- 현재 결과에 필수: 계약 이슈, OpenSpec, 구현 이슈와 tasks 순서로 갱신한다.
- 독립적으로 전달 가능: 새 계약 이슈와 새 OpenSpec으로 분리한다.
- 현재 필요 없음: 후속 이슈를 만들고 제외 범위 또는 deferred decision에 연결한다.

## 4. Completion Gate

다음 조건을 모두 만족한 뒤 계약 이슈를 닫는다.

- 구현 이슈와 PR이 완료됐다.
- requirement scenario와 통합 사용자·시스템 흐름이 검증됐다.
- 현재 OpenSpec tasks가 완료됐다.
- 구현, canonical 문서와 OpenSpec 사이에 불일치가 없다.
- OpenSpec change를 active specs에 archive했다.
- archive 후 validation이 통과한다.

여러 구현 PR이 하나의 OpenSpec을 공유하면 마지막 통합 이슈 또는 PR이 archive와 최종 검증을 소유한다.

## 예외

- **기존 계약 복구 버그:** active spec에 이미 정의된 행동만 복구하면 기존 requirement를 참조해
  Issue -> Implementation으로 진행하고 회귀 테스트를 추가한다.
- **행동 변화 없음:** 기계적 refactor, test-only 보강, 오탈자 수정, dependency와 tooling 정리는 관찰 가능한
  행동을 유지할 때 새 OpenSpec이 필요하지 않다.
- **작은 변경:** 단일 PR 행동 변경은 같은 브랜치에 OpenSpec과 구현을 포함할 수 있지만 이슈가 먼저 존재하고
  코드가 확장되기 전에 spec gate를 통과해야 한다.
- **긴급 장애:** 이슈는 생성한다. 기존 계약을 복구하거나 계약 변경이 불가피하면 최소한의 완전한 OpenSpec을
  포함한다.
- **조사:** spike는 OpenSpec 없이 진행할 수 있다. 구현하기로 결정하면 계약 이슈를 먼저 만든다.
- **owner 없는 active change:** 추가 구현 전에 계약 이슈를 지정하고 proposal과 tasks를 이슈 구조에 연결한다.

## 금지 패턴

- OpenSpec을 먼저 만들고 나중에 이를 다시 설명하는 이슈를 만드는 것
- Project 전체를 하나의 영구 미완료 OpenSpec backlog로 사용하는 것
- DB, API, UI, test마다 동일한 공유 계약을 복제하는 것
- 독립 범위를 Linear 없이 `tasks.md`에만 추가하는 것
- 행동 변경을 Linear와 OpenSpec 갱신 없이 코드에만 반영하는 것
- 완료된 change를 archive하지 않고 active 상태로 방치하는 것
