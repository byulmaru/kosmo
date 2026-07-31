# ADR 0017: Profile Search Staged Visibility

## 상태

Accepted

## 날짜

2026-07-27

## 2026-07-30 보완

[PROD-573](https://linear.app/byulmaru/issue/PROD-573/인증된-원격-프로필-검색-시-activitypub-actor-materialization)은
프로필 route의 직접 조회가 아니라 인증된 사람 검색에서 명시적인 원격 qualified handle 전체를 입력한 경우에만
아직 저장되지 않은 Remote Profile을 materialize하도록 이 결정을 보완한다. 일반 부분 검색과 저장된 Profile의
visibility는 이 ADR의 기존 staged 조건을 유지한다.

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
  partial `searchProfiles`는 기존 exact lookup의 현재 visibility를 그대로 재사용한다. configured local Instance에서는
  `ProfileState.ACTIVE` Profile만 포함하고, remote Instance에서는 `ProfileState.ACTIVE` Profile과
  `InstanceState.SUSPENDED`가 아닌 Instance만 포함한다. 따라서 `ProfileState.SUSPENDED` Profile과 suspended
  Instance의 Remote Profile은 현재 단계에서도 제외된다.
- 기본 검색 대상은 configured local Instance에 저장된 Local Profile과 입력 domain의 ActivityPub Instance에
  이미 저장된 Remote Profile로 한정한다. 일반 텍스트, 부분 remote handle, local handle, malformed handle과
  저장된 Remote Profile 검색은 WebFinger, actor document fetch·refresh 또는 새 Remote Profile
  materialization을 수행하지 않는다.
- 유효한 Account 인증을 통과한 `searchProfiles`가 명시적인 `@handle@instance` qualified handle 전체를 입력받고
  해당 Remote Profile이 아직 저장되지 않은 경우에만, 기존 Remote Profile lookup 정책과 actor materialization
  경계로 원격 actor를 조회하고 저장한 뒤 기존 DB 검색을 수행할 수 있다. materialization 뒤에도 이 ADR의
  staged visibility를 통과한 Profile만 검색 결과로 반환한다.
- 명시적 원격 검색의 lookup 실패, identity 충돌 또는 새 원격 요청을 보낼 수 없는 Instance는 검색 요청을
  실패시키지 않고 materialization 전과 같은 빈 검색 결과로 처리한다. 예상하지 못한 오류는 관측 가능하게
  남긴다.
- exact `profileByHandle`, 프로필 route와 그 하위 경로는 원격 materialization을 시작하지 않으며 저장된
  Profile만 조회한다.
- 이 staged 예외는 현재 저장된 Profile의 exact/partial handle lookup에만 적용한다. ADR이 최종 moderation 정책의
  예외를 직접 승인하거나 Domain Limit/Profile Domain Block을 생략해도 된다는 일반 권한을 부여하는 것은 아니다.
- Domain Limit과 viewer Profile Domain Block의 저장 모델 및 공통 predicate가 도입되면, exact `profileByHandle`과
  partial `searchProfiles`를 같은 rollout에서 공통 predicate로 함께 전환한다. 두 lookup이 서로 다른 visibility
  정책을 적용하는 중간 상태를 허용하지 않는다.

## 이유

PROD-504의 검색 범위는 이미 저장된 Profile을 기존 exact lookup과 같은 경계로 읽는 것이다. 없는 저장 모델이나
공통 predicate를 부분 검색에서만 새로 추정하면 exact와 partial 결과가 달라지고, 최종 canonical 정책이 구현된
것처럼 잘못 기록될 수 있다. 현재 단계의 예외를 별도 ADR로 명시하면 구현 범위와 최종 moderation 목표를 모두
추적할 수 있다.

PROD-573의 좁은 예외는 인증된 Account가 원격 qualified handle 전체를 명시한 경우에만 원격 요청을 허용해
일반 검색과 익명 요청의 fetch surface를 열지 않는다. materialization 뒤 기존 DB 검색과 staged visibility를
다시 적용하면 remote discovery와 Profile 노출 정책을 분리하면서 저장되지 않은 원격 계정을 검색할 수 있다.

## 종료 조건

향후 moderation 변경에서 Domain Limit과 viewer Profile Domain Block의 저장 모델 및 공통 visibility predicate를
도입하고, exact와 partial lookup에 대한 통합 검증을 완료하면 이 staged 예외를 종료한다. 해당 후속 rollout에서는
두 lookup을 동시에 canonical moderation 정책으로 전환하고, 이 ADR을 그 전환을 가리키는 후속 결정으로
supersede한다.

## 문서 반영

- [Profile](../objects/profile.md)은 최종 조회 정책과 현재 staged exception을 함께 참조한다.
- `add-partial-profile-search` OpenSpec과 Linear `PROD-504`는 이 ADR의 현재 단계 조건을 따른다.
- Linear `PROD-573`과 적용되는 OpenSpec은 인증된 명시적 원격 qualified handle materialization 보완을 따른다.
