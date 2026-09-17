# Canonical -> Linear -> Implementation 워크플로

## 목적

Kosmo의 지속되는 권위는 제품이 지켜야 할 비즈니스 요구사항에만 둔다.

```text
Canonical 비즈니스 요구사항
  -> Linear의 문제·가치·범위·완료 결과
  -> 구현과 검증

필요한 경우에만 위 작업을 돕는 OpenSpec 세션 하네스
```

정리하면, 사용자와 현재 canonical·Linear에 명시된 비즈니스 요구사항이 authority다. OpenSpec은 그것을
실행하는 동안 작업 기억을 제공할 수 있지만 authority를 대신하지 않는다.

OpenSpec CLI나 skill이 제공하는 기본 artifact·gate·lifecycle은 이 저장소의 scope·authority·optionality 정책을
덮지 않는다. 예전 Domain·Issue·OpenSpec artifact를 다음 단계로 넘기는 gate는 구현 prerequisite가 아니다.
제품·배포의 실제 운영 승인 gate와 과거에 확정된 비즈니스 결정은 각자의 권위를 그대로 유지한다. Historical
archive는 필요하면 `--skip-specs`로 처리하며, 세션을 닫을 때는 실제로 남은 요구사항과 검증 증거만
pending/handoff로 보존한다.

## 현재 사용자 합의

현재 사용자 합의는 이 작업 범위에서 사용자가 명확하게 지시·선택·확인한 내용이다. 일반 대화도 충분하며
특정 문구나 형식의 댓글·승인 기록은 필요 없다. 질문·예시·잠정 아이디어·AI 추론은 합의가 아니고, 이미 정해진
선택은 OpenSpec이나 이전 메모리가 다시 열지 않는다.
합의가 제품 행동·공개 계약·보안·롤아웃·소유권·완료 기준을 장기적으로 바꾸면 비즈니스 요구사항과 이유를
canonical 문서에 기록하고, Linear 이슈가 있으면 문제·가치·범위·완료 결과를 함께 갱신한다. 구현 수단은
코드·테스트·PR의 맥락으로 남긴다. 세션 지시·대화는 필요할 때 PR 근거로 요약할 수 있지만 승인 ledger·
approval template·필수 필드를 만들거나 OpenSpec에 복제하지 않는다.

## 적용 범위와 결정 경계

이 문서는 새 제품 행동·공개 계약·보안·롤아웃 또는 되돌릴 수 없는 외부 상태를 다루는 구현과 그 문서화를
안내한다. 행동 변화가 없는 정리, 기존 요구사항을 그대로 적용하는 구현과 짧은 조사는 이 문서를 참고하되
새 OpenSpec을 만들 이유가 없다.

다음 선택은 구현자가 추측하지 않는다.

- 사용자가 보게 될 행동, 권한, 데이터 의미, 공개 계약 또는 호환성 보장
- 보안 경계, 운영·롤아웃 정책, 승인 조건 또는 rollback 보장
- 소유권, 범위, 독립 전달 여부와 완료 기준
- 외부 시스템에 되돌릴 수 없는 상태를 남기는지 여부

이런 내용이 현재 사용자 지시나 canonical·Linear에 정해져 있지 않으면 구현을 멈추고 질문한다. 답을 얻으면
비즈니스 요구사항과 결과를 먼저 canonical·Linear에 반영한 뒤 구현을 계속한다. OpenSpec이 먼저 발견한 내용을
그 자체로 승인된 요구사항으로 승격하지 않는다.

그 밖의 함수명, 모듈 경계, 파일 위치, 자료구조, 테스트 배치, migration 구현 방식과 같은 선택은 현재
요구사항 안에서 구현자가 정한다. 의미 있는 trade-off가 있으면 PR에 기록할 수 있지만 canonical·Linear의
제품 요구사항이나 세션 하네스의 영구 결정으로 만들지 않는다.

## Canonical 문서와 Linear의 경계

| 기록                    | 남길 내용                                                                                                                                                       | 남기지 않을 내용                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Canonical domain/design | 사용자·시스템 결과, 비즈니스 규칙, 권한·보안·호환성 보장, 운영·롤아웃 제약과 결정 이유. 외부에서 강제한 기술 형태는 source와 필요한 이유·범위만 예외적으로 기록 | 함수·파일·테이블·payload·framework·구현 순서, 팀의 기술 선호              |
| Linear                  | 문제, 비즈니스 가치, 이번 전달 범위, 포함·제외 결과, 독립적인 의존성·책임, 결과 수준의 완료 조건                                                                | 구현 계획·task 목록, 특정 API/DB/UI 구조, OpenSpec을 완수해야 한다는 조건 |
| 코드·테스트·PR          | 구현 수단, 실행 흐름, 실패 처리와 실제 검증 증거                                                                                                                | 코드만으로 새 비즈니스 요구사항을 조용히 결정하는 것                      |
| OpenSpec                | 현재 세션의 목표, non-goals, 확인된 제약, 검증 계획, 진행 상태와 임시 작업 메모                                                                                 | 상위 기록에 없는 요구사항·권위·영구 구현 결정                             |

보안, 운영, 호환성처럼 기술적 형태를 갖는 내용도 실제로 지속되어야 하는 보장과 이유를 비즈니스 언어로
기록한다. 예를 들어 “비밀을 클라이언트에 노출하지 않는다”는 canonical 제약이지만 “특정 helper와
middleware를 사용한다”는 구현 선택이다.

## Linear 작업을 시작하는 방법

1. 현재 문제와 영향을 받는 사용자·시스템 결과를 확인한다.
2. Linear 이슈가 있으면 이번 전달 결과, 포함·제외 범위와 결과 수준의 완료 조건을 적는다.
3. 적용되는 canonical 문서와 아직 결정되지 않은 비즈니스·보안·롤아웃 질문을 연결한다.
4. 구현과 필요한 검증을 시작한다. OpenSpec은 아래 조건에서만 추가한다.
5. 구현 중 요구사항의 누락·모순을 발견하면 코드로 우회하지 않고 canonical·Linear를 먼저 갱신한다.
6. 구현 결과와 검증 증거를 PR에 기록하고, scoped 결과가 끝나면 PR과 해당하는 이슈를 완료한다.

구현 계획만을 전달 결과로 하는 Linear 이슈를 만들지 않는다. 구현을 여러 PR로 나누어야 하는 경우에도 각
이슈는 독립된 비즈니스 결과, 운영 위험 또는 rollout 결과가 있을 때만 만든다. 필요한 cross-slice 통합 검증은
그 결과를 소유한 이슈·PR의 범위에 포함할 수 있으며, 별도 비즈니스 결과가 없다면 별도 이슈를 만들지 않는다.
단순히 파일·package·OpenSpec task가 다르다는 이유로 이슈를 늘리지 않는다.

## OpenSpec 세션 하네스

### 만들지 않아도 되는 경우

단일 구현과 focused test로 범위가 분명하거나, 기존 요구사항을 그대로 적용하는 작업이면 OpenSpec을 만들지
않는다. OpenSpec을 만들지 않은 이유를 남겨야 한다는 별도 형식도 없다.

### 만들면 유용한 경우

- 한 세션에서 여러 구현 slice를 조정해야 한다.
- 검증 순서나 실패 경로를 잊기 쉽다.
- 진행 중인 작업을 같은 세션에서 다시 읽어야 한다.
- 이미 승인된 범위 안에서 짧은 handoff 메모가 필요하다.

이 경우에도 Goal, Non-goals, Constraints, Verification, Progress / risks 중 현재 세션을 이해하고 검증하는 데
필요한 항목만 기록하며, Goal은 현재 사용자 요청과 canonical·Linear(해당하는 경우)가 승인한 scoped 결과를
요약한다.

디자인·tasks·decision 메모가 구현에 도움이 되면 추가할 수 있지만 `working note` 또는 `suggested approach`로
취급한다. 임시 구현 선택을 적을 수는 있어도 다음 세션이나 다른 구현자를 구속하는 durable decision으로 쓰지
않는다. 미래 기능, sibling 범위, speculative abstraction과 독립 결과를 현재 하네스에 추가하지 않는다.

### 수명과 수정

- 하네스는 세션과 현재 작업 결과에 종속된다. 구현 중 발견한 사실에 따라 언제든 줄이거나 고친다.
- 필요 없어진 task는 수행하지 않고 `Not needed`로 표시하거나 삭제한다. checkbox를 채우기 위해 구현을 늘리지
  않는다. 아직 필요한 비즈니스 요구사항을 불필요하다는 이유로 버리지 말고 `Pending` 또는 handoff로 남긴다.
- 완료된 작업은 PR의 코드·테스트·검증 결과가 source of truth다. OpenSpec task 완료나 archive는 PR readiness,
  Linear 완료 또는 배포 승인의 전제조건이 아니다.
- 사용·완료·superseded된 하네스는 가능하면 구현 PR 안에서 `--skip-specs`로 archive한다. 이는 저장 정리와
  과거 맥락을 위한 기본 선호일 뿐 PR readiness·completion gate가 아니며, 이 선호만을 위한 archive-only
  issue·PR를 만들지 않는다. 실제로 남은 요구사항·검증은 pending/handoff로 보존한다. 오래된 change, strict
  validation 통과, 다른 OpenSpec의 참조만으로 현재 요구사항·구현·리뷰 범위를 넓히지 않는다.
- 기존 OpenSpec을 이어받을 때는 매번 현재 사용자 요청과 canonical·Linear를 독립적으로 확인한다. 이전
  artifact의 내용은 참고 자료일 뿐 자동으로 상속되는 요구사항이 아니다.

### 하네스와 계약이 충돌할 때

OpenSpec과 canonical·Linear 또는 실제 사용자 지시가 다르면 다음 순서로 처리한다.

1. 현재 사용자 지시와 canonical·Linear에 이미 정해진 결과가 있는지 먼저 확인한다. 정해진 결과와 다른
   하네스는 authority를 갖지 않으므로 즉시 고친다. settled decision을 하네스가 되풀이해 열지 않는다.
2. 아직 정해지지 않은 비즈니스·보안·롤아웃 결정이면 OpenSpec을 멈추고 사람에게 질문한 뒤
   canonical·Linear를 갱신한다.
3. 구현 선택의 차이면 현재 요구사항을 만족하는 최소 구현을 선택하고 하네스를 고친다.
4. 하네스에만 있는 요구사항·scenario·task는 제거하거나 참고 메모로 낮춘다.

OpenSpec의 scenario가 현재 요구사항에 필요하지 않다면 그 scenario를 만족시키기 위한 caller·helper·API를
추가하지 않는다. production caller가 아직 없다는 사실만으로 현재 요구사항이 요구하는 새 caller나 결과를
제외하지 않는다. 실제 사용자·시스템 workflow와 canonical·Linear의 결과가 review와 검증의 기준이다.

## 구현·검증·리뷰

- 구현은 현재 canonical·Linear의 비즈니스 결과를 가장 작은 변경으로 만족해야 한다.
- 테스트는 입력, 출력, 상태 변화와 실패 경로를 실행해 결과를 증명한다. OpenSpec 문구를 검색하는 것으로
  검증을 대신하지 않는다.
- 리뷰 finding은 canonical·Linear·사용자 지시의 요구사항, 실제 runtime 동작, 보안·운영 위험과 검증 증거를
  근거로 작성한다. OpenSpec에만 적힌 구현 task나 접근을 지키지 않았다는 이유로 blocker를 만들지 않는다.
- PR에 기록할 중요한 결정은 관찰 가능한 행동, 데이터 의미, 보안, 호환성, 롤아웃 또는 가역성에 영향을 주는
  선택이다. 이 결정이 제품 계약을 바꾸면 PR에만 남기지 않고 canonical·Linear를 먼저 갱신한다.
- 구현 선택과 후속 아이디어는 PR의 구현 맥락으로 남긴다. 독립적인 비즈니스 결과·운영 위험·롤아웃 결과가
  생긴 경우에만 후속 이슈를 만들고, 제품 정책·보안 보장·롤아웃 결정은 canonical·Linear에 남긴다.

## 완료 기준

PR과 작업은 다음을 충족하면 완료할 수 있다.

- 현재 사용자 요청과 canonical·Linear(해당하는 경우)가 승인한 scoped 비즈니스 결과가 구현됐다.
- 필요한 문서 변경이 canonical·Linear에 반영됐다.
- 담당 테스트와 focused validation이 실제 결과와 실패 경로를 증명한다.
- 알려진 제한과 후속 범위의 ownership이 PR 또는 Linear에 드러난다.

OpenSpec을 만들었다는 이유로 별도의 gate 승인, 모든 task 수행, 전체 change archive 또는 다른 PR의 완료를
기다리지 않는다. 여러 PR이 하나의 사용자 결과를 나누어 전달하는 경우에도 각 PR은 자신이 소유한 결과와
검증을 기준으로 readiness를 판단한다. 필요한 cross-slice 통합 검증은 해당 scoped 결과의 완료 증거로 계속
수행하며, 독립된 결과·owner·lifecycle이 있을 때만 별도 이슈로 분리한다.

## 예외와 금지 패턴

- 기존 계약 복구 버그는 현재 canonical·Linear의 요구사항을 복구하고 회귀 테스트를 추가한다. 필요하지 않으면
  새 OpenSpec을 만들지 않는다.
- 행동 변경 없는 refactor, test-only 보강, 오탈자 수정과 tooling 정리는 새 OpenSpec 없이 진행할 수 있다.
- 긴급 장애에서는 문제와 영향, 완화·복구 결과를 Linear에 남기고 보안·롤아웃 판단이 필요하면 사람에게 묻는다.
- 조사는 OpenSpec 없이 진행할 수 있다. 구현으로 이어질 때 필요한 비즈니스 결과를 해당 Linear 이슈가 있으면
  먼저 맞춘다.
- OpenSpec strict validation, archive 상태, 파일 수와 issue 계층만으로 제품 요구사항이나 구현 범위를 추론하지 않는다.
- OpenSpec의 task·scenario·design 권장 접근을 만족시키려고 caller·API·DB·UI·retry·추상화를 추가하지 않는다.
