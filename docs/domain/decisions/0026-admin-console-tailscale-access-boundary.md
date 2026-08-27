# ADR 0026: Admin Console Tailscale Access Boundary

## 상태

Accepted

## 날짜

2026-08-27

## 맥락

Admin Console은 Kosmo의 일반 사용자 인증과 별도로 Tailscale 접근 제어를 통과한 운영자에게 Account, Profile과
Account-Profile Membership 읽기를 제공해야 한다. 기존 도메인에서 운영자 행동의 주체는
`Account.Operator`인 Kosmo Account다. Tailscale identity를 Account 인증이나 운영자 권한으로 해석하면 인증
주체, 운영자 Mutation 권한, 운영자용 read-only 도구의 경계가 합쳐진다.

v1의 세 읽기 범위를 서로 다른 권한으로 나눌 제품 요구는 없다. 따라서 연결 권한을 통과한 주체에게 일부
projection만 허용하는 애플리케이션 capability 계층은 두지 않는다. 이 결정은 App Capability와 객체별 action을
사용한 [ADR 0025](./0025-admin-console-capability-holder-boundary.md)를 대체한다.

## 결정

- Admin Console 요청 주체를 `Admin Console Viewer`라는 별도 개념으로 둔다. Viewer는 Kosmo Account가 아니며
  `Account.Operator` 사실을 갖지 않는다.
- Admin Console 진입 권한의 source of truth는 Tailscale 접근 정책이다. 신뢰된 Tailscale proxy와 네트워크
  경계를 우회한 요청은 Admin Console 읽기 경계가 아니다.
- 일반 workload의 proxy 우회는 차단하지만 Kubernetes node 자체, kubelet과 node 권한을 가진 운영 주체는
  신뢰된 인프라로 보고 v1 위협 모델의 차단 대상에서 제외한다.
- v1은 all-or-nothing 접근 모델을 사용한다. 진입이 허용된 Viewer는 Account, Profile,
  Account-Profile Membership 읽기 projection을 모두 사용할 수 있다.
- 애플리케이션은 Tailscale App Capabilities, `account.read`, `profile.read` 또는 객체별 Admin Console action을
  소비하거나 계산하지 않는다.
- identity header는 선택적인 display metadata이며 인가, Account 매핑, `Account.Operator` 판정에 사용하지
  않는다. login과 display name만 사용하고 profile picture header는 사용하지 않는다.
- 상세한 Account, Profile, Membership 필드와 projection 분리는
  [Admin Console Read Policy](../policies/admin-console-read.md)가 소유한다.
- Admin Console v1은 읽기 전용이다. 이 경계는 기존 Account 인증, Profile Owner/Member 사실,
  `Account.Operator` 기반 운영자 Mutation 권한을 변경하지 않는다.
- Admin-specific 성공·실패 조회 감사, identity snapshot, 접근 실패·proxy 우회·위조 header security event
  logging, 검색값 및 보존 기간은 v1에서 모두 제외한다. 기존 공통 runtime 오류·접근 로그의 동작은 이 결정의
  범위가 아니다.

## 이유

Tailscale 접근 정책을 단일 진입 권한으로 사용하면 별도 capability 전달 경로와 action 조합 없이 필요한
read-only surface를 제공할 수 있다. identity header를 표시 용도로만 제한하면 표시 문자열의 변조, 누락,
Account 변경이 Kosmo 도메인 권한을 만들지 않는다.

`Account.Operator`를 재사용하지 않으면 Admin Console read-only 도구가 Account/Profile Mutation이나 내부
운영자 권한을 우연히 상속하지 않는다. 세 projection을 구조적으로 분리하면 같은 Viewer에게 모두 허용하면서도
Account나 Profile 응답을 통해 관계 정보를 암묵적으로 노출하지 않는다.

## 결과

- Admin Console Viewer의 identity가 Account와 같아 보여도 Account self, Member, Owner, Operator 관계는
  성립하지 않는다.
- Admin Console의 객체 조합과 노출 필드는 [Admin Console Read Policy](../policies/admin-console-read.md)
  하나에서 확인할 수 있다.
- Account, Profile, Membership 객체 문서의 기존 domain fact와 Mutation 권한은 유지된다.
- 객체별 Admin Console 권한이나 감사·security-event logging을 도입하려면 이 ADR과 정책을 갱신하는 별도
  결정이 필요하다.

## 근거

- [PROD-689](https://linear.app/byulmaru/issue/PROD-689)
- [Account](../objects/account.md)
- [Profile](../objects/profile.md)
- [Account-Profile Membership](../objects/account-profile-membership.md)
- [ADR 0019: Selected Profile Authorization Boundary](./0019-selected-profile-authorization-boundary.md)

## 문서 반영

- [Admin Console Read Policy](../policies/admin-console-read.md)는 단일 접근 경계, 객체별 필드와 projection
  분리를 정의한다.
- [Account](../objects/account.md)는 Admin Console 정책과 별개인 Account.Operator 사실을 유지하고,
  Account 표시 이름과 OIDC subject를 Account 속성으로 정의한다.
