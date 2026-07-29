# Review Style Memory

## Purpose

- kosmo PR을 리뷰하거나 기존 리뷰에서 컨벤션을 추출할 때 이 메모를 적용한다.
- 리뷰는 한국어로 작성한다.
- 자동 생성 PR 본문보다 사람이 직접 남긴 review comment, review summary, resolved thread를 더 신뢰한다.

## Review Posture

- 발견 사항은 사용자 영향, 런타임 동작, 캐시/스키마 계약, 보안/운영 실패 가능성 순으로 판단한다.
- OpenSpec change를 구현 완료한 PR은 `openspec/changes/<change>`가 archive되고 delta가 `openspec/specs/*` active spec에 반영됐는지 확인한다. 구현과 검증이 끝났는데 change가 active로 남아 active spec이 예전 계약을 유지하면 리뷰에서 막는다.
- 추측보다 재현 근거를 우선한다. 실제 로컬 실행, target runner 실행, Storybook 렌더링, 기기/시뮬레이터 동작 확인을 근거로 삼는다.
- 단순 취향보다 "왜 이 shape가 다음 변경에서 문제가 되는지"를 설명한다.
- 변경 이유가 불명확하면 먼저 "왜 바뀌었는지"를 묻는다.
- 플랫폼 제약이 의심되면 Windows symlink, Node version, runner capability, browser/runtime API 지원 여부를 확인한다.

## Responsibility Before Remedy

- 문제가 보인다는 이유만으로 현재 함수나 package에 해결 책임을 부여하지 않는다. 잘못된 상태를 만든 주체, 그 입력을
  보장해야 하는 계약 주체, 현재 component가 보정까지 소유하는지를 먼저 확인한다.
- 외부 protocol 참여자가 유효한 값을 광고하거나 제공해야 하는 계약과 Kosmo가 방어적으로 보정할 수 있다는 사실을
  구분한다. 예를 들어 유효한 ActivityPub shared inbox를 광고하는 책임은 remote server에 있다. Kosmo의 개별 delivery
  transport가 malformed endpoint마다 서로 다른 fallback을 추가해야 한다고 바로 결론 내리지 않는다.
- 현재 위치에서 보정하면 upstream 결함을 숨기거나 component마다 다른 정책이 생기는지도 확인한다.

## Explicit Domain Inputs

- 함수 동작을 transaction 존재 여부, 호출 package 또는 현재 entry point 같은 간접 정보에서 추론하지 않는다.
- `tx`는 caller transaction 참여 여부만 뜻한다. provenance, 실행 origin 또는 side effect 필요 여부를 뜻하지 않는다.
- 도메인에서 `LOCAL | ACTIVITYPUB` 같은 구분이 필요하면 명시적 input으로 표현하고 transaction composition과 독립적으로
  다룬다. `LOCAL + tx`와 `ACTIVITYPUB + tx`처럼 의미상 유효한 조합을 막지 않는다.
- optional callback의 존재, generic execution mode 또는 타입 이름 뒤에 실제 분기를 숨기지 않는다. 호출자가 이름과
  input/result만 보고 의무와 실행 시점을 알 수 있어야 한다.

## Shared Domain Entry Points

- 같은 도메인 행위는 GraphQL, ActivityPub, background task 등 caller가 달라도 하나의 public core action을 사용한다.
- caller별 action, transaction helper 또는 직접 DB mutation으로 validation, idempotency, exact-row guard와 result shape를
  복제하지 않는다.
- protocol caller가 추가 identity 검증을 소유할 수는 있지만, 검증된 identity를 공통 action에 전달하고 실제 domain
  mutation을 우회하지 않는다.

## Layer Ownership

- API는 인증·session/profile context, transport input 해석, 접근 가능한 target 확인, core action 호출과 response mapping을
  소유한다. protocol-specific command나 vocabulary projection을 조립하지 않는다.
- Core는 domain state transition, transaction 참여, idempotency, exact-row 보호, origin에 따른 lifecycle과 committed
  result에서의 failure isolation을 소유한다.
- Fedify 같은 transport boundary는 저장 projection 조회, ActivityPub vocabulary 직렬화, actor/activity/key identity,
  recipient endpoint 선택, signature와 실제 delivery를 소유한다.
- package cycle 때문에 dynamic import가 필요하더라도 이 임시 module 경계를 API 책임으로 올리지 않는다.

## Commit And Side Effects

- remote I/O를 domain transaction 안에서 실행하지 않는다. domain transaction commit 뒤 기존 transport boundary로
  전달하고 delivery failure가 committed application result를 실패로 바꾸지 않게 격리한다.
- caller-owned transaction에서도 같은 action을 유지해야 하면 Core가 명시적인 post-commit lifecycle을 반환하고
  transaction owner가 commit 뒤 호출하게 할 수 있다. 어떤 lifecycle을 만들지는 `tx`가 아니라 actual state change와
  domain origin이 결정한다.
- 반환된 lifecycle은 반복·동시 호출이 실제 side effect 중복으로 이어지지 않는지 확인한다.
- queue, outbox와 durable retry가 후속이라면 현재 direct-delivery slice의 선행 조건으로 만들지 않는다. 대신 process
  종료 시 유실, retry 부재와 서로 다른 transaction 사이의 ordering 제한을 명시한다.

## Scope And Follow-ups

- 관련 문제를 발견해도 현재 issue의 계약을 넓혀 sibling interaction이나 독립 delivery policy까지 함께 구현하지 않는다.
- 현재 기능에 필수인지, 독립 배포 가능한지, 별도 product/architecture 결정이 필요한지, 이미 소유 issue가 있는지를
  확인한다.
- 기존 backlog가 정확히 소유하면 새 issue를 중복 생성하지 않고 현재 failure path, 보장 범위와 완료 기준을 보강한다.
- follow-up으로 분리한 문제는 현재 PR이 보장하는 범위, 아직 보장하지 않는 범위와 현재 실패 동작을 기록한다.

## Spec Reachability

- OpenSpec scenario가 production caller에서 도달 가능한지 확인한다. caller가 없고 현재 issue 목표에도 필요하지 않다면
  필요 없는 구현을 추가해 spec을 억지로 만족시키지 않는다.
- 후속 fan-out이나 sibling 기능을 전제한 scenario와 내부 helper 세부사항은 durable public contract에서 제거한다.
- scenario를 제거하거나 계약을 고치면 active spec과 archive artifact를 함께 동기화한다.

## Finding Evidence

- finding을 유지하기 전에 production caller, 저장 상태 전이, base branch/merge tree, PR이 만든 변화인지와 실제 domain
  contract 위반을 확인한다.
- test-only injected path나 가능성만 있는 문제를 확인된 production defect처럼 표현하지 않는다.
- 반대로 현재 caller가 없다는 이유만으로 잘못된 public interface를 허용하지 않는다. 공개 contract 자체가 caller에게
  암시적이거나 잘못된 조합을 허용하는지도 별도로 판단한다.
- 코드가 짧다는 이유로 암시적 설계를 선택하지 않고, 미래 확장을 이유로 coordinator, mode, port 같은 추측성 추상화도
  만들지 않는다. 현재 요구를 만족하는 최소한의 명시적 contract를 선호한다.

## Comment Shape

- 가능한 한 정확한 파일/라인에 단다.
- inline comment를 제출하기 직전에 live diff를 다시 조회하고 실제 changed hunk의 추가·수정 라인에 anchor한다.
- PR head가 force-push나 rebase로 바뀌었거나 `Line could not be resolved`가 반환되면 같은 line payload를 반복하지 말고 최신 diff에서 anchor를 다시 계산한다.
- 코멘트에는 다음 중 필요한 것을 포함한다.
  - 현재 코드가 만드는 동작
  - 실제 영향 또는 깨지는 workflow
  - 관찰한 재현 결과
  - 선호하는 수정 방향 또는 suggested change
  - 지금 PR에서 막아야 하는지, follow-up으로 둘 수 있는지
- actionable blocker와 non-blocking note를 구분한다.
- 후속 정책으로 미뤄도 되는 내용은 `TODO:` 주석, OpenSpec 남은 결정, 후속 PR/이슈로 남기도록 요구한다.

## Priority Labels

- `P1`: merge 전에 고쳐야 하는 동작/보안/캐시/API 계약 문제.
- `P2`: 지금 고치는 편이 좋지만, 범위와 위험에 따라 후속으로 분리할 수 있는 문제.
- `P3`: 설계 방향이나 미래 정책을 위해 짚는 낮은 우선순위 문제.
- `P5`: 사소한 일관성, 불필요한 변수/wrapper, 정리성 문제.
- priority를 붙이면 이유도 함께 적는다. 숫자만 남기지 않는다.

## Thread Handling

- 리뷰 thread 확인, 응답, resolve, merge 전 정리는 `memory/review-thread.md`를 따른다.
- 이 파일은 리뷰 코멘트 작성 스타일, priority label, 근거 제시 기준만 다룬다.

## Review Conclusion

- 최종 결론은 PR의 목적, 사용자·외부 시스템에 보이는 변화, 실제 실행 흐름, 확인된 finding, 범위 밖 또는 후속 문제,
  검증 결과와 merge 가능 여부 순으로 설명한다.
- `문제가 없어 보인다`로 끝내지 않는다. 필수 CI, unresolved thread, public contract, failure isolation과 알려진 제한의
  ownership을 근거로 지금 merge 가능한지 명시한다.
