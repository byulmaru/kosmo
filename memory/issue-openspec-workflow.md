# Domain -> Issue -> OpenSpec -> Implementation 워크플로

## 목적

Kosmo 기능 개발은 다음 순서를 기본으로 한다.

```text
Canonical 도메인·디자인 요구사항 확정
  -> Linear 이슈 구조
  -> OpenSpec
  -> 구현
  -> 통합 검증과 archive
```

- `docs/domain`과 `docs/design`은 이슈를 만들기 전에 제품 요구사항과 durable decision을 확정하는 canonical
  source다.
- Linear는 작업이 필요한 이유, 전달 결과, 우선순위, 범위, 소유권과 의존성을 정의한다.
- OpenSpec은 승인된 이슈를 요구사항, 설계, 결정과 검증 가능한 구현 작업으로 구체화한다.
- 구현은 이슈와 OpenSpec을 실행하고, 구현에서 확인한 계약 문제를 canonical 문서부터 정식 순서로 다시
  반영한다. OpenSpec을 backlog 작업이나 제품 요구사항이 처음 발견되는 장소로 사용하지 않는다.

적용되는 `docs/domain`과 `docs/design` 문서는 해당 영역의 canonical source다. Linear와 OpenSpec은 이를
재정의하지 않고 참조한다.

## 단계별 검토와 승인

각 gate의 담당자는 다음 단계로 넘어가기 전에 변경 내용을 사람이 검토하기 쉬운 목록으로 정리하고 명시적
승인을 받는다. gate 승인은 artifact를 만들거나 수정해도 된다는 허가가 아니라, 현재 gate의 결과를 다음
gate의 입력으로 사용해도 된다는 전환 승인이다.

현재 gate 안에서는 승인을 기다리지 않는다. 요구사항, 결정, 정정 또는 리뷰 의견이 생길 때마다 담당
canonical 문서, Linear 이슈, OpenSpec과 PR 본문을 즉시 갱신하고 현재 리뷰 목록에도 반영한다. 결정을 여러
개 모아 한꺼번에 기록하거나 gate 승인 뒤로 파일 수정을 미루지 않는다. 아직 확정되지 않은 내용은 확정한
것처럼 기록하지 않고 미결정과 소유 이슈를 명시한다.

문서와 OpenSpec 초안을 수정하거나 Linear 이슈를 생성했다는 사실은 gate 승인으로 간주하지 않는다. 명시적
승인 전에는 현재 결과를 승인된 전제로 삼아 다음 gate의 설계, 구현 또는 완료 작업을 진행하지 않는다.

각 승인 요청에는 최소한 다음 내용을 포함한다.

- 새로 확정하거나 변경한 요구사항과 결정
- 적용한 canonical 문서, 이슈 또는 OpenSpec artifact
- 포함 범위, 제외 범위와 남은 미결정
- 생성·수정한 이슈의 부모·자식 관계, 의존성과 각 이슈의 검증 책임
- 이전 승인 내용과 달라진 점
- 승인 뒤 착수할 다음 단계

사람이 목록을 보고 항목별로 수정할 수 있도록 제목과 결과 단위로 나누고, 이미 생성한 artifact가 있으면
식별자와 링크를 함께 제공한다. 수정 요청이 나오면 해당 gate의 artifact와 목록을 갱신해 다시 승인을 받는다.
이 갱신은 별도 허가를 기다리지 않고 수정 요청이나 결정이 나온 즉시 수행한다.

## 책임 경계

| 단위             | 소유하는 것                                                                     | 소유하지 않는 것                   |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| Project          | 장기 제품 영역, 우선순위, milestone                                             | 하나의 영구적인 OpenSpec change    |
| Milestone        | 독립적으로 전달할 수 있는 제품 단계                                             | 세부 행동 계약과 구현 설계         |
| 도메인 결정 이슈 | 회의·조사가 필요한 제품 결정, canonical 문서 반영, downstream 이슈 계약 정렬    | OpenSpec, 구현 코드와 최종 archive |
| 계약 이슈        | 하나의 닫힌 결과, 범위, 제약, OpenSpec 생명주기, 최종 통합 검증과 archive       | 모든 구현을 한 PR에 담는 책임      |
| 구현 이슈        | 리뷰 가능한 구현 결과 하나, 브랜치, PR, 해당 구현을 증명하는 테스트와 검증 증거 | 공유 계약을 복제한 별도 OpenSpec   |
| OpenSpec change  | 계약 이슈를 구체화한 요구사항, 설계, durable decision, 구현 체크리스트          | Linear 우선순위와 이슈 계층        |
| PR               | 해당 이슈가 소유한 OpenSpec, 구현, 검증 또는 archive 결과                       | Project 전체 backlog               |

OpenSpec 작성 자체만을 전달 결과로 삼는 Linear 이슈는 만들지 않는다. 작은 변경은 하나의 계약 이슈가
OpenSpec, 구현, 테스트, 통합 검증과 archive를 모두 소유한다. 여러 구현 PR이 필요한 변경은 계약 부모와 구현
자식 이슈들로 나누며, 계약 부모는 추적용 컨테이너가 아니라 최종 통합 검증과 archive를 직접 수행한다.

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
계약 이슈
  -> OpenSpec
  -> 구현 + 해당 구현의 테스트
  -> 통합 검증 + archive

여러 PR이 필요한 변경
계약 부모
  -> OpenSpec
  -> 구현 이슈 A: 구현 + 해당 구현의 테스트
  -> 구현 이슈 B: 구현 + 해당 구현의 테스트
  -> 부모: 완성된 결과의 통합 테스트 + 정합성 확인 + archive

부분 통합 계층이 반드시 필요한 예외
전체 계약 부모
  -> 부분 계약 부모
     -> 구현 이슈 A
     -> 구현 이슈 B
     -> 부분 부모: 부분 통합 테스트
  -> 구현 이슈 C
  -> 전체 부모: 전체 통합 테스트 + archive

장기 제품 영역
Project / Milestone
  -> 계약 이슈 A -> OpenSpec A -> 구현
  -> 계약 이슈 B -> OpenSpec B -> 구현
```

## 1. Domain Gate

기능 이슈를 만들기 전에 적용되는 canonical 도메인·디자인 문서를 먼저 확인하고 요구사항을 견고하게
만든다. 이 단계는 이슈가 제품 요구사항을 처음 발견하거나 OpenSpec이 제품 계약을 대신 결정하지 않게 하는
gate다.

다음 내용을 canonical 문서에서 확인하거나 확정한다.

- 사용자 또는 시스템이 관찰할 수 있는 결과와 보편 언어
- durable 객체, 상태, 속성, 관계, Mutation, 권한과 조회 정책
- 포함 범위, 명시적 제외 범위와 후속 결정
- 다른 객체·정책과의 연결, 생명주기와 실패 시 유지하거나 제거할 관계
- 이슈 경계, rollout, 보안 또는 호환성을 바꿀 수 있는 제품 결정

다음 조건이면 이슈 생성을 멈추고 도메인·디자인 문서를 먼저 갱신한다.

- 같은 행동을 서로 다르게 해석할 수 있다.
- 객체 소유권, 상태 전이, 권한 또는 조회 결과가 정해지지 않았다.
- 미결정 사항의 선택에 따라 이슈 수, 부모·자식 구조 또는 독립 전달 가능성이 달라진다.
- 구현 이슈가 제품 요구사항을 대신 결정해야만 완료 조건을 작성할 수 있다.

미결정을 닫는 데 회의, 조사 또는 여러 사람의 협의가 필요하면 선택적으로 도메인 결정 이슈를 만들어 Domain
Gate 작업을 추적할 수 있다. 이 이슈는 결정할 질문과 근거, 회의 결과, canonical 문서 반영, 이미 만든
downstream 계약·구현 이슈 본문 정렬과 Domain Gate 승인까지 소유한다. 실제 계약·구현 이슈는 미리 초안으로
만들 수 있지만 도메인 결정 이슈에 blocked 관계로 연결하고, 결정 이슈가 완료되기 전에는 OpenSpec Gate로
넘어가지 않는다.

도메인 결정 이슈는 제품 결정을 전달하는 이슈이지 OpenSpec 작성 이슈가 아니다. OpenSpec, 구현 코드, 구현
테스트 또는 최종 archive를 소유하지 않으며, 결정과 문서 정렬이 끝나면 downstream 계약 이슈가 OpenSpec
생명주기와 실제 전달을 이어받는다.

Domain Gate 논의에서 요구사항이나 결정이 닫히면 해당 canonical 문서와 ADR을 즉시 수정한다. 회의 전체 종료,
결정 묶음 완성 또는 Domain Gate 승인을 기다렸다가 반영하지 않는다. 정정이 나오면 이전 초안을 즉시 고치고,
아직 닫히지 않은 결정만 도메인 결정 이슈에 남긴다.

구체 테이블, GraphQL payload, 함수, 컴포넌트, migration 방식과 파일별 작업처럼 제품 계약을 바꾸지 않는
구현 선택은 Domain Gate에서 고정하지 않는다.

Domain Gate 승인 요청은 변경한 요구사항, 닫힌 결정, 남은 미결정, 이슈로 나눌 수 있는 독립 전달 결과를
목록으로 제시한다. 명시적 승인 전에는 Issue Gate로 넘어가지 않는다.

## 2. Issue Gate

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
- OpenSpec에서 정밀화할 구현 제약과 기술적 질문

테이블 shape, GraphQL payload, 함수, 컴포넌트, migration 방식과 파일별 작업은 기존 공개 계약이 이미
고정한 경우가 아니라면 이 단계에서 확정하지 않는다.

여러 PR이 필요한 변경은 OpenSpec 착수 전에 구현 자식 경계를 생성하거나 최소한 초안으로 정리한다.
계약 부모는 OpenSpec과 모든 구현 자식의 완료 뒤에 수행할 통합 테스트, 정합성 확인과 archive 결과를 완료
조건으로 가진다. 구현과 분리된 테스트 전용 자식 이슈는 기본적으로 만들지 않는다.

Issue Gate 승인 요청은 생성·수정한 계약 부모와 구현 자식을 제목, 전달 결과, 포함·제외 범위, 부모·자식
관계, blocker, 각자의 테스트·통합·archive 책임으로 나열한다. 이슈를 미리 생성했더라도 명시적 승인 전에는
OpenSpec Gate로 넘어가지 않는다.

## 3. OpenSpec Gate

OpenSpec은 저장소의 `spec-driven-decisions` schema를 따른다.

- `proposal.md`: Linear 이슈를 영향받는 capability와 repository impact로 번역한다.
- `specs/**/spec.md`: 규범적이고 검증 가능한 행동을 정의한다.
- `design.md`: 현재 구현 제약, 비규범적 권장 접근, 허용 가능한 대안과 알려진 함정, 위험, migration과 rollback을 설명한다.
- `decisions.md`: 구현자가 반드시 지켜야 하는 durable choice, 대안, 결과와 남은 결정을 권위 유형과 함께 기록한다. 파일명, 함수, helper나 자료구조는 장기 호환성·보안·rollout 또는 여러 구현 slice가 정확한 선택을 공유해야 할 때만 고정한다.
- `tasks.md`: 승인된 구현 이슈를 의존 순서의 검증 가능한 작업으로 구체화한다. 각 task group은 결과 수준의
  Deliverable, specs·공개 계약·Active decision에서 파생한 Guardrails, 완료를 증명할 Verification을 checkbox와
  분리해 제공한다.

OpenSpec decision은 다음 세 종류로 구분한다.

- `Derived Contract`: 현재 canonical 또는 Linear 계약을 그대로 파생한다. 새 제품 행동을 추가하지 않는다.
- `Implementation Choice`: 상위 계약 범위 안에서 구현 수단을 선택한다. 미래 이슈나 제외 범위를 현재 선택의
  필수 근거로 사용할 수 없으며 새로운 제품 행동을 추가하지 않는다.
- `Upstream Change Required`: OpenSpec 작성 중 새 제품 행동이나 범위를 발견한 상태다. 현재 Authority는
  없으며 canonical·Linear가 갱신될 때까지 `Blocked`로 유지한다.

단일 `Accepted` 상태는 사용하지 않는다. 각 decision은 날짜, Decision Class, 정확한 canonical·Linear
Authority / Provenance와 `Active | Blocked | Superseded` 상태를 기록한다. `Blocked` decision은 spec
requirement, task Guardrail 또는 checkbox의 구현 근거가 될 수 없다.

기존 active change의 `Accepted` 기록은 일괄 rewrite하지 않는다. 기존 기록을 적용할 때도 canonical·Linear를
독립 확인하고, 해당 decision을 실제로 수정하거나 대체할 때 새 형식으로 전환한다.

OpenSpec끼리의 참조, strict validation 통과, 테스트와 PR 구현은 상위 계약이 존재한다는 증거가 아니다.
OpenSpec Gate와 구현·리뷰에서는 applicable canonical 문서와 최신 Linear 본문·계약 변경 댓글을 OpenSpec과
독립적으로 읽고 불일치를 사람이 검토한다.

proposal은 계약 이슈를 링크한다. 공유 change의 task heading은 이미 존재하는 구현 이슈를 식별한다.

```md
## 1. PROD-123 Data export API

**Deliverable**

권한이 있는 사용자가 요청한 데이터를 CSV로 내보낼 수 있다.

**Guardrails**

- 기존 export 권한을 우회하지 않는다.

**Verification**

- 성공한 요청의 CSV 내용과 권한 실패를 검증한다.

- [ ] 1.1 ...
- [ ] 1.2 ...

## 2. PROD-124 Data export client

**Deliverable**

클라이언트가 export를 요청하고 생성된 CSV를 내려받을 수 있다.

**Guardrails**

없음.

**Verification**

- export 요청, 완료와 다운로드 흐름을 검증한다.

- [ ] 2.1 ...
```

`design.md`의 Recommended Approach는 구현자가 안전하게 시작하기 위한 기본 경로이지 규범적 계약이 아니다.
구현자는 authority가 확인된 specs와 decisions, Deliverable, Guardrails와 Verification을 모두 만족하면
Allowed Alternatives나 동등한 방식을 선택할 수 있다. 권장 접근을 task checkbox에 복제해 내부 구현 수단으로
고정하지 않는다.

`tasks.md`는 숨은 backlog가 아니다. OpenSpec 작업 중 제품 요구사항이나 독립적으로 전달할 결과가 처음
발견되면 작업을 멈춘다. 제품 계약이면 canonical 문서를 먼저 갱신하고, 독립 결과면 Linear 이슈를 생성하거나
분리한 뒤 OpenSpec을 갱신한다.

OpenSpec은 구현 전에 계약을 검증할 수 있을 만큼 완전해야 하지만 최초 작성 상태로 동결하지 않는다. 구현에서
현재 계약의 누락, 모순 또는 현실과 맞지 않는 가정을 발견하면 변경 종류에 따라 canonical 문서, Linear,
OpenSpec 순서로 갱신한 뒤 구현을 계속한다.

다음 조건을 모두 만족한 뒤 구현을 시작한다.

- Linear와 OpenSpec의 목표와 범위가 일치한다.
- 필요한 specs, design, decisions, tasks가 존재한다.
- 이슈 분리나 계약 경계를 바꿀 미결정 사항이 없다.
- tasks가 구현 소유권과 의존 순서에 대응한다.
- `openspec validate <change> --strict`가 통과한다.

OpenSpec만을 만들기 위한 Linear 이슈는 두지 않는다. 여러 PR이 공유하는 change에서 구현 전 OpenSpec
검토·merge가 필요하더라도 이는 계약 부모가 소유한 생명주기의 일부이지 독립적인 전달 결과가 아니다.

OpenSpec Gate 승인 요청은 requirement와 scenario, Active/Blocked/Superseded decision, 구현 이슈별 task
ownership, 권장 접근과 허용 대안, 검증 계획, canonical 문서·Linear와 달라진 점을 나열한다. 각 규범 단위,
Decision Class, 상위 근거와 새로 추가한 내용을 함께 제시한다. 명시적 승인, 독립 authority 대조와 strict
validation 확인 전에는 Implementation Gate로 넘어가지 않는다.

## 4. Implementation Gate

- 하나의 구현 브랜치와 PR은 하나의 Linear 구현 이슈에 대응한다.
- 구현 이슈는 계약 부모와 OpenSpec change를 링크한다.
- PR은 담당 이슈의 구현 결과와 그 결과를 증명하는 단위·통합·회귀 테스트를 함께 소유한다.
- 구현은 최신 canonical·Linear와 독립 대조한 specs, design과 decisions를 함께 만족해야 한다.
- 구현자는 design의 Current Constraints와 Known Traps를 확인하고 Recommended Approach를 기본 경로로 검토한다.
  다른 접근도 Deliverable, Guardrails, Verification, specs와 독립 확인한 decisions를 모두 만족하면 허용한다.
- 다른 접근이 범위, 관찰 가능한 행동, 공개 계약 또는 durable decision을 바꾸면 구현을 멈추고 canonical
  문서, Linear와 OpenSpec을 먼저 갱신한다.
- 제품 행동이나 범위가 바뀌면 canonical 문서, Linear, OpenSpec, 코드 순서로 갱신한다.
- 계획·구현 중 독립 확인한 decision으로 정해지지 않은 중요한 선택이 필요하면 AI는 대안과 trade-off를 비교해
  제시할 수 있지만, 최종 선택과 이유는 사람이 결정하도록 멈춘다. 관찰 가능한 행동, 데이터, 보안, 호환성,
  rollout, 가역성 또는 후속 구현 방향에 영향을 주며 실질적인 대안이 있었던 선택을 중요한 결정으로 본다.
- 구현 PR을 열거나 갱신하기 전에 구현 중 실제로 확정된 중요한 결정을 식별한다. AI는 이미 확정된 선택과
  이유를 바탕으로 PR 결정문을 작성할 수 있지만, 근거가 없거나 불명확한 선택과 이유를 추론해 만들지 않고
  결정한 사람에게 확인한다.
- PR에는 중요한 구현 결정의 선택, 고려한 대안, 이유와 감수한 결과를 기록한다. 새로 내린 중요한 결정이
  없다면 authority를 독립 확인한 OpenSpec decision을 그대로 적용했음을 명시하며 형식적인 결정을 만들지 않는다.
- durable decision은 PR에 전문을 복제하지 않고 링크와 적용 결과를 남기며 실제 canonical·Linear
  Authority를 함께 링크한다. 구현 중 새로운 durable
  decision이 필요해지면 PR 본문에만 기록하지 않고 Linear와 OpenSpec을 먼저 갱신한다.

새로 발견한 작업은 다음처럼 처리한다.

- 현재 결과에 필수인 제품 계약: canonical 문서, 계약 이슈, OpenSpec, 구현 이슈와 tasks 순서로 갱신한다.
- 독립적으로 전달 가능한 제품 결과: Domain Gate를 다시 통과한 뒤 새 계약 이슈와 새 OpenSpec으로 분리한다.
- 현재 필요 없음: 후속 이슈를 만들고 제외 범위 또는 deferred decision에 연결한다.

### 테스트와 부분 통합 이슈

- 각 구현 이슈는 자신의 결과를 증명하는 테스트를 구현과 함께 만든다.
- 테스트 종류나 package가 다르다는 이유만으로 테스트 전용 이슈를 분리하지 않는다.
- 계약 부모의 통합 테스트는 자식 테스트를 반복하지 않고, 여러 구현 결과를 연결해야만 확인할 수 있는 최종
  사용자·시스템 흐름을 검증한다.
- 일부 구현 조각만 결합했을 때 별도의 통합 위험과 완료 결과가 생기는 경우에만 부분 계약 부모를 둘 수 있다.
- 부분 계약 부모 아래 구현 이슈들은 각자 테스트를 소유하고, 부분 부모는 그 조각들을 연결하는 통합 테스트를
  소유한다.
- 부분 부모가 별도 OpenSpec을 archive하려면 그 부분이 독립적으로 승인, 전달, 검증과 연기할 수 있는 별도
  계약이어야 한다. 같은 OpenSpec의 task 일부가 끝났다는 이유로 부분 archive하지 않는다.
- 부분 통합 계층 없이 구현 이슈의 테스트와 최상위 통합 검증으로 충분하면 중간 부모를 만들지 않는다.

각 구현 이슈의 완료 승인 요청은 실제 구현 결과, 중요한 구현 결정, 담당 테스트와 검증 증거, canonical
문서·Linear·OpenSpec 변경 여부, 남은 위험을 나열한다. 수정 요청이 있으면 PR과 관련 artifact를 갱신해 다시
승인을 받는다.

## 5. Completion Gate

다음 조건을 모두 만족한 뒤 계약 이슈를 닫는다.

- 구현 이슈와 PR이 완료됐다.
- 계약 부모가 requirement scenario와 여러 구현 결과를 연결하는 통합 사용자·시스템 흐름을 검증했다.
- 현재 OpenSpec tasks가 완료됐다.
- `Blocked` 또는 아직 supersede되지 않은 `Upstream Change Required` decision이 남아 있지 않다.
- 구현, canonical 문서와 OpenSpec 사이에 불일치가 없다.
- OpenSpec change를 active specs에 archive했다.
- archive 후 validation이 통과한다.

여러 구현 PR이 하나의 OpenSpec을 공유하면 계약 부모가 통합 테스트, 정합성 확인, archive와 archive 후
validation을 직접 소유한다. 부모를 단순 추적 컨테이너로 닫지 않는다.

Completion Gate 승인 요청은 완료된 구현 이슈와 PR, 최종 통합 테스트 결과, requirement scenario 충족,
canonical 문서·OpenSpec 정합성, archive diff와 validation 결과를 나열한다. OpenSpec archive artifact를 미리
준비할 수 있지만 명시적 승인 전에는 계약 이슈를 완료하지 않는다.

## 예외

- **기존 계약 복구 버그:** active spec에 이미 정의된 행동만 복구하면 기존 requirement를 참조해
  Issue -> Implementation으로 진행하고 회귀 테스트를 추가한다.
- **행동 변화 없음:** 기계적 refactor, test-only 보강, 오탈자 수정, dependency와 tooling 정리는 관찰 가능한
  행동을 유지할 때 새 OpenSpec이 필요하지 않다.
- **작은 변경:** 단일 PR 행동 변경은 하나의 계약 이슈가 OpenSpec, 구현, 테스트, 통합 검증과 archive를
  소유한다. Domain Gate와 Issue Gate를 통과하고 코드가 확장되기 전에 OpenSpec Gate를 통과해야 한다.
- **긴급 장애:** 이슈는 생성한다. 기존 계약을 복구하거나 계약 변경이 불가피하면 최소한의 완전한 OpenSpec을
  포함한다.
- **조사:** spike는 OpenSpec 없이 진행할 수 있다. 구현하기로 결정하면 계약 이슈를 먼저 만든다.
- **owner 없는 active change:** 추가 구현 전에 계약 이슈를 지정하고 proposal과 tasks를 이슈 구조에 연결한다.

## 금지 패턴

- OpenSpec을 먼저 만들고 나중에 이를 다시 설명하는 이슈를 만드는 것
- gate별 변경 목록과 명시적 승인 없이 다음 단계로 넘어가는 것
- artifact를 미리 생성했다는 이유로 승인된 것으로 간주하는 것
- canonical 도메인 요구사항의 미결정을 구현 이슈나 OpenSpec에 넘기는 것
- OpenSpec 작성만을 전달 결과로 가진 Linear 이슈를 만드는 것
- 계약 부모를 범위 추적만 하는 빈 컨테이너로 두는 것
- 구현이 소유해야 할 테스트를 별도 테스트 전용 이슈로 분리하는 것
- 독립적인 부분 통합 결과가 없는데 중간 부모와 추가 archive 계층을 만드는 것
- Project 전체를 하나의 영구 미완료 OpenSpec backlog로 사용하는 것
- DB, API, UI, test마다 동일한 공유 계약을 복제하는 것
- 독립 범위를 Linear 없이 `tasks.md`에만 추가하는 것
- 행동 변경을 Linear와 OpenSpec 갱신 없이 코드에만 반영하는 것
- 완료된 change를 archive하지 않고 active 상태로 방치하는 것
