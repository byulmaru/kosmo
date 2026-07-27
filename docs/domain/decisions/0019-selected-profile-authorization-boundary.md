# ADR 0019: Selected Profile Authorization Boundary

## 상태

Accepted

## 날짜

2026-07-27

## 결정

- Account 요청의 selected Profile은 Account-Profile Membership으로 정하며 Local 또는 Remote일 수 있다.
- GraphQL `usingProfile` 경계는 Active Account, selected Profile Membership과 selected Profile의 조회 가능
  상태를 한 번 검증한다. 이 경계를 통과한 resolver와 application action은 같은 Account, Membership,
  Profile visibility를 중복 조회하거나 권한 조건으로 다시 만들지 않는다.
- application action은 검증된 Profile identity를 받고 행동에 고유한 상태, 관계, 대상, transaction과
  persistence 조건을 검증한다. Profile Origin, Instance Reachability 또는 Instance Type은 해당 행동의
  의미가 명시적으로 요구할 때만 조건으로 사용한다.
- Media Source, Post 저장 위치처럼 결과 객체나 저장 결과의 Local/Remote 구분은 행동 주체 Profile의
  Origin을 결정하지 않는다. Source=Local Media와 Kosmo에 저장되는 Post, Bookmark, Reaction은 Remote
  selected Profile도 만들 수 있다.
- 이 결정은 Remote Profile 사이의 Follow를 새로 허용하지 않는다. Follow는
  [Follow Relationship](../objects/follow-relationship.md)과 [Follow Request](../objects/follow-request.md)의
  별도 origin·delivery 조건을 계속 따른다.

## 근거

- [PROD-439](https://linear.app/byulmaru/issue/PROD-439/kosmo에서-uploading-local-media를-생성한다)
- [Core 서비스 경계](../../architecture/core-services.md)

## 문서 반영

- [Account-Profile Membership](../objects/account-profile-membership.md)은 selected Profile 자격과 Local
  Profile 운영 권한을 구분한다.
- [Post](../objects/post.md), [Media](../objects/media.md), [Bookmark](../objects/bookmark.md),
  [Reaction](../objects/reaction.md)은 action별 조건과 결과 source를 분리한다.
