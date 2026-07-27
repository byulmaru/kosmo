# ADR 0017: Profile Search Staged Visibility

## 상태

Accepted

## 날짜

2026-07-27

## 맥락

Profile의 최종 공개 조회·검색 정책은 [Profile](../objects/profile.md)에 정의되어 있다. 따라서 공개 Profile은
Active이며 Normal이어야 하고, Domain Limit Instance의 Remote Profile과 viewer Profile이 Domain Block한
Instance의 Remote Profile은 검색 결과에서 제외되어야 한다.

현재 저장 모델과 조회 계층에는 Domain Limit과 viewer Profile Domain Block을 exact/partial Profile lookup에
함께 적용할 공통 predicate가 아직 없다. 이 상태에서 PROD-504의 부분일치 검색을 출시해야 하므로, 현재 구현이
최종 moderation 정책을 바꾸지 않는다는 조건으로 제한된 staged visibility를 기록한다.

## 결정

- 최종 canonical moderation 정책은 변경하지 않는다. Domain Limit Instance의 Remote Profile 제외와 viewer
  Profile Domain Block 대상 Instance의 Remote Profile 비노출은 계속 목표 정책이다.
- 이 ADR은 PROD-504의 선행 조건이 아니다. PROD-504의 exact/partial 검색 구현은 아래 staged visibility 조건을
  따르는 범위에서 진행할 수 있다.
- 저장 모델과 공통 predicate가 없는 현재 단계에서만, PROD-504의 persisted Profile exact `profileByHandle`과
  partial `profilesByHandle`은 기존 exact lookup의 현재 visibility를 그대로 재사용한다. configured local Instance에서는
  `ProfileState.ACTIVE` Profile만 포함하고, remote Instance에서는 `ProfileState.ACTIVE` Profile과
  `InstanceState.SUSPENDED`가 아닌 Instance만 포함한다. 따라서 `ProfileState.SUSPENDED` Profile과 suspended
  Instance의 Remote Profile은 현재 단계에서도 제외된다.
- 검색 대상은 configured local Instance에 저장된 Local Profile과 입력 domain의 ActivityPub Instance에 이미
  저장된 Remote Profile로 한정한다. 검색 중 WebFinger, actor document fetch·refresh 또는 새 Remote Profile
  materialization을 수행하지 않는다.
- 이 staged 예외는 현재 저장된 Profile의 exact/partial handle lookup에만 적용한다. ADR이 최종 moderation 정책의
  예외를 직접 승인하거나 Domain Limit/Profile Domain Block을 생략해도 된다는 일반 권한을 부여하는 것은 아니다.
- Domain Limit과 viewer Profile Domain Block의 저장 모델 및 공통 predicate가 도입되면, exact `profileByHandle`과
  partial `profilesByHandle`을 같은 rollout에서 공통 predicate로 함께 전환한다. 두 lookup이 서로 다른 visibility
  정책을 적용하는 중간 상태를 허용하지 않는다.

## 이유

PROD-504의 검색 범위는 이미 저장된 Profile을 기존 exact lookup과 같은 경계로 읽는 것이다. 없는 저장 모델이나
공통 predicate를 부분 검색에서만 새로 추정하면 exact와 partial 결과가 달라지고, 최종 canonical 정책이 구현된
것처럼 잘못 기록될 수 있다. 현재 단계의 예외를 별도 ADR로 명시하면 구현 범위와 최종 moderation 목표를 모두
추적할 수 있다.

## 종료 조건

향후 moderation 변경에서 Domain Limit과 viewer Profile Domain Block의 저장 모델 및 공통 visibility predicate를
도입하고, exact와 partial lookup에 대한 통합 검증을 완료하면 이 staged 예외를 종료한다. 해당 후속 rollout에서는
두 lookup을 동시에 canonical moderation 정책으로 전환하고, 이 ADR을 그 전환을 가리키는 후속 결정으로
supersede한다.

## 문서 반영

- [Profile](../objects/profile.md)은 최종 조회 정책과 현재 staged exception을 함께 참조한다.
- `add-partial-profile-search` OpenSpec과 Linear `PROD-504`는 이 ADR의 현재 단계 조건을 따른다.
