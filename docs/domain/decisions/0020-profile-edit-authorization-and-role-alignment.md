# ADR 0020: Profile Edit Authorization and Role Alignment

## 상태

Accepted

## 날짜

2026-07-28

## 결정

- Local Profile의 표시 이름은 1-40자다. Remote Profile의 원격 원본 표시 이름 보존과 수집 제한은 Local
  Profile 편집 계약과 분리한다.
- Profile 편집은 [ADR 0019](./0019-selected-profile-authorization-boundary.md)의 selected Profile 인증 경계를
  통과한 Account가 selected Profile의 Owner일 때만 허용한다. 임의의 다른 Profile을 편집 대상으로 삼지 않는다.
- 편집 대상은 Active/Normal Local Profile이다. Deactivated, Deleted, Suspended 또는 Remote Profile은 이
  행동으로 편집하지 않는다.
- Account Profile Role은 Owner와 Member만 가진다. Admin은 레거시 역할이며 canonical 역할 집합에서 제거한다.
  Profile 운영과 Membership 변경은 Owner만 수행하고 Member는 selected Profile의 소셜 행동 주체가 될 수 있다.
- avatar/header에는 편집 대상 Profile의 Ready Local Media만 연결한다. 다른 Profile의 Media는 같은 Account가
  업로드했더라도 재사용하지 않으며 교체·제거는 Profile Representation 관계만 바꾸고 Media를 삭제하지 않는다.
- 이번 Profile 편집 전달은 표시 이름, bio, Follow Approval Policy와 avatar/header를 포함한다. Profile Link
  편집은 별도 계약으로 전달한다.

## 근거

- [PROD-489](https://linear.app/byulmaru/issue/PROD-489/프로필-수정-범위와-canonical디자인-계약을-정렬한다)
- [Selected Profile Authorization Boundary](./0019-selected-profile-authorization-boundary.md)

## 문서 반영

- [Profile](../objects/profile.md)은 Local 표시 이름 검증과 selected Profile Owner 편집 조건을 정의한다.
- [Account-Profile Membership](../objects/account-profile-membership.md)은 Owner와 Member 역할만 정의한다.
- [Media](../objects/media.md)는 avatar/header에 연결할 수 있는 Media와 관계 교체·제거 결과를 정의한다.
