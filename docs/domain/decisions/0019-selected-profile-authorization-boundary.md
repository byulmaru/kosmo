# ADR 0019: Selected Profile Authorization Boundary

## 상태

Accepted

## 날짜

2026-07-27

## 2026-09-14 보완

[PROD-962](https://linear.app/byulmaru/issue/PROD-962/프로필-선택-권한을-account-profile-membership-하나로-정리한다)의
결정으로 selected Profile의 선택 자격을 Account-Profile Membership 하나로 정정한다. 기존의 Local 또는
Remote 선택 capability를 명시한 문구와 selected Profile이 Remote일 때의 행동 보장은 현재 계약에서 제거한다.
현재 운영 경로에 Remote Profile Membership 생성이 없다는 사실은 구현 결과이며, Remote 선택을 지원하거나
금지하는 capability로 해석하지 않는다.

## 결정

- Account 요청의 selected Profile 자격은 요청 Account와 Profile 사이의 Account-Profile Membership 존재로만
  결정한다. 선택 경계는 Profile Origin, Account Profile Role 또는 Profile 생성자 여부를 별도 조건으로 검사하지
  않는다.
- `selectProfile`과 GraphQL `usingProfile` 경계는 Active Account, selected Profile Membership과 selected
  Profile의 조회 가능 상태를 공통으로 확인한다. 이 경계를 통과한 resolver와 application action은 같은 Account,
  Membership, Profile visibility를 중복 조회하거나 권한 조건으로 다시 만들지 않는다.
- application action은 검증된 Profile identity를 받고 행동에 고유한 상태, 관계, 대상, transaction과
  persistence 조건을 검증한다. Profile Origin, Instance Reachability 또는 Instance Type은 해당 행동의
  의미가 명시적으로 요구할 때만 조건으로 사용한다.
- Media Source, Post 저장 위치처럼 결과 객체나 저장 결과의 Local/Remote 구분은 행동 주체 Profile의
  Origin이나 selected Profile 자격을 결정하지 않는다. 결과의 Origin·delivery 의미가 필요한 조건은 각 행동의
  고유 계약으로만 유지한다.
- Follow는 [Follow Relationship](../objects/follow-relationship.md)과
  [Follow Request](../objects/follow-request.md)의 별도 origin·delivery 조건을 계속 따른다. 이 결정은
  해당 조건을 selected Profile의 공통 선택 자격으로 확장하지 않는다.

## 근거

- [PROD-439](https://linear.app/byulmaru/issue/PROD-439/kosmo에서-uploading-local-media를-생성한다)
- [Core 서비스 경계](../../architecture/core-services.md)

## 문서 반영

- [Account-Profile Membership](../objects/account-profile-membership.md)은 selected Profile 자격을 Membership
  존재로 정하고, Local Profile 운영 권한과 별도로 다룬다.
- [Post](../objects/post.md), [Media](../objects/media.md), [Bookmark](../objects/bookmark.md),
  [Reaction](../objects/reaction.md)은 action별 조건과 결과 source를 분리한다.
