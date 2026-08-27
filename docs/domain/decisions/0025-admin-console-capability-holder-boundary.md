# ADR 0025: Admin Console Capability Holder Boundary

## 상태

Superseded by [ADR 0026](./0026-admin-console-tailscale-access-boundary.md)

## 날짜

2026-08-25

## 맥락

Admin Console은 Kosmo의 일반 사용자 인증과 별도로 신뢰된 proxy에서 전달한 capability를 사용해 Account,
Profile과 Account-Profile Membership을 읽어야 한다. 기존 도메인에서 운영자 행동의 주체는
`Account.Operator`인 Kosmo Account다. proxy identity header를 Account 인증이나 운영자 권한으로 해석하면
인증 주체, 운영자 Mutation 권한, 운영자용 read-only 도구의 경계가 합쳐진다.

Tailscale proxy는 요청에 identity header를 제공할 수 있지만 header의 존재나 표시 값만으로 권한을 결정할
수 없다. 반대로 capability가 유효한 요청은 표시용 identity header가 없어도 읽기 정책을 적용할 수 있어야
한다.

## 결정

- Admin Console 요청 주체를 `Capability Holder`라는 별도 개념으로 둔다. Capability Holder는 Kosmo
  Account가 아니며 `Account.Operator` 사실을 갖지 않는다.
- Admin Console capability namespace는 `byulmaru.co/cap/kosmo-admin`으로 고정한다.
- v1 action은 `account.read`와 `profile.read`만 지원한다. 두 action을 가진 경우에만
  Account-Profile Membership을 읽을 수 있다.
- 인가의 유일한 근거는 신뢰된 proxy가 전달한 capability다. identity header는 선택적인 display metadata이며
  인가, Account 매핑, `Account.Operator` 판정에 사용하지 않는다.
- Tailscale identity를 표시할 때는 login과 display name만 사용하고 profile picture header는 사용하지 않는다.
- 유효한 capability object가 여러 개면 지원 action을 union한다. 알 수 없는 action은 권한을 부여하지 않고
  무시하며 wildcard는 지원하지 않는다. target namespace가 없으면 grant 없음으로 처리하고, 존재하는 target
  namespace의 parameter object가 하나라도 malformed이면 payload 전체를 거부한다.
- 상세한 Account, Profile, Membership 필드와 단일 action별 제외 범위는
  [Admin Console Read Policy](../policies/admin-console-read.md)가 소유한다.
- Admin Console v1은 읽기 전용이다. 이 경계는 기존 Account 인증, Profile Owner/Member 사실,
  `Account.Operator` 기반 운영자 Mutation 권한을 변경하지 않는다.
- Admin-specific 성공·실패 조회 감사, capability/identity snapshot, malformed·인가 실패·proxy 우회·위조
  header security event logging, 검색값 및 보존 기간은 v1에서 모두 제외한다. 기존 공통 runtime 오류·접근
  로그의 동작은 이 결정의 범위가 아니다.

## 이유

Capability와 identity header를 분리하면 proxy가 현재 요청 주체를 표시할 수 있으면서도 표시 문자열의 변조,
누락, Account 변경이 읽기 권한을 만들지 않는다. 여러 capability object의 union은 proxy가 capability를
분리해 전달해도 동일한 action 집합을 계산하게 하며, malformed payload 전체 거부는 일부 object만 적용하는
모호한 부분 허용을 막는다.

`Account.Operator`를 재사용하지 않으면 Admin Console read-only 도구가 Account/Profile Mutation이나 내부
운영자 권한을 우연히 상속하지 않는다. Membership을 두 read action의 교집합으로 제한하면 Account와 Profile
중 하나만 읽을 수 있는 요청에서 두 객체 사이의 관계나 관계 count가 새 정보 경로가 되는 것도 막는다.

## 결과

- Capability Holder의 identity가 Account와 같아 보여도 Account self, Member, Owner, Operator 관계는
  성립하지 않는다.
- Admin Console의 객체 조합과 노출 필드는 [Admin Console Read Policy](../policies/admin-console-read.md)
  하나에서 확인할 수 있다.
- Account, Profile, Membership 객체 문서의 기존 domain fact와 Mutation 권한은 유지된다.
- 감사와 security-event logging을 후속으로 도입하려면 이 ADR과 정책을 갱신하는 별도 결정이 필요하다.

## 근거

- [PROD-689](https://linear.app/byulmaru/issue/PROD-689)
- [Account](../objects/account.md)
- [Profile](../objects/profile.md)
- [Account-Profile Membership](../objects/account-profile-membership.md)
- [ADR 0019: Selected Profile Authorization Boundary](./0019-selected-profile-authorization-boundary.md)

## 문서 반영

- [Admin Console Read Policy](../policies/admin-console-read.md)는 capability 검증, action 조합, 객체별 필드와
  제외 범위를 정의한다.
- [Account](../objects/account.md)는 Admin Console 정책과 별개인 Account.Operator 사실을 유지하고,
  Account 표시 이름과 OIDC subject를 Account 속성으로 정의한다.
