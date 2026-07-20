# ADR 0002: PR Review Domain Adjustments

## 상태

Accepted

## 날짜

2026-06-29

중첩 Repost 평탄화 결정은 [ADR 0010](./0010-post-interaction-contracts.md)의 직접 Source 참조와 Repost 입력
거절 결정으로 대체되었다. 나머지 결정은 유지한다.

## 결정

- Post List의 canonical term은 `Post List`다. Home, Profile, Hashtag Post List만 현재 범위로 둔다.
- Post List는 durable 객체가 아니라 [Post List Policy](../policies/post-list.md)다.
- Home과 Profile Post List는 Post Form이 Repost 또는 Quote인 Post를 후보로 사용할 수 있다.
- Hashtag Post List는 Public Original/Quote Post만 포함하고 Reply와 Repost는 포함하지 않는다.
- Reply Author는 Parent와 독립적으로 Post Visibility를 선택한다.
- Public/Unlisted Post의 Repost는 Unlisted가 된다. Followers Only Post는 Source Author만 Repost할 수 있고
  결과도 Followers Only가 된다.
- Mentioned Profiles Post는 Repost할 수 없다.
- Repost 입력이 Repost면 그 Repost의 Source를 사용해 중첩 Repost를 평탄화한다. Repost Source는 Original,
  Reply 또는 Quote Post다.
- Quote는 자체 본문 또는 Media와 Quote Source를 가진 Post Form이다. Quote 입력은 Source Form과 관계없이 입력
  Post 자체를 참조하며, Quote Eligibility는 Quote Source 조회 가능성도 요구한다.
- Reaction은 같은 Post/Profile/Emoji 조합에 하나만 존재하며 다른 Emoji Reaction은 함께 존재할 수 있다.
- Post 본문은 500자 이하이고 Media가 있으면 비어 있을 수 있다.
- 게시 후 Post Visibility와 Attached Media 관계는 바꾸지 않는다.
- Followers Only Post는 Author, Follower, Mentioned Profile이 볼 수 있다.
- Sensitive Media는 Post 속성이고 Alt Text는 Media 속성이다.
- Word Mute와 Hashtag Mute는 대소문자를 구분하지 않는다. Word Mute는 부분 문자열로 match한다.
- Post thread 알림 억제는 [Post Notification Mute](../objects/post-notification-mute.md)가 소유한다.
- Profile 대상 Mute와 Block은 각각 [Profile Mute](../objects/profile-mute.md),
  [Profile Block](../objects/profile-block.md)이 소유한다.
- 기존 Notification은 이후 Mute가 생겨도 삭제하거나 Read State를 바꾸지 않는다. Profile Block은 함께
  제거되는 Follow Request/Relationship을 직접 원인으로 가진 Notification만 제거한다.
- Domain Block과 Profile Domain Block 대상 콘텐츠는 적용 대상 viewer에게 없는 것처럼 취급한다.
- 신고 제출, 신고 묶음, 신고 처리, Labeler, stackable policy, 커뮤니티 관리는 현재 범위에서 제외한다.

## 문서 반영

- [Post](../objects/post.md)는 본문, Post Form, Post Visibility, Content Warning, Sensitive Media를 정의한다.
- [Media](../objects/media.md)는 이미지 중심의 Media와 Alt Text를 정의한다.
- [Post List Policy](../policies/post-list.md)는 후보 합성과 제어 결정을 정의한다.
- [Notification](../objects/notification.md)은 개별 알림과 Read State만 소유한다.
- 개인 제어 설정은 각각의 독립 객체 문서가 소유한다.
