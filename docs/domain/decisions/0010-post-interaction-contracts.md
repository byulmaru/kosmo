# ADR 0010: Post Interaction Contracts

## 상태

Accepted

## 날짜

2026-07-20

## 결정

- Reply는 Reply Parent를 직접 참조하고 Kind가 Reply인 Post다. Reply Parent는 Original, Reply 또는 Quote이며
  Repost는 Parent가 될 수 없다. 다른 Post로 평탄화하지 않는다.
- Reply Parent가 Tombstone이거나 viewer가 조회할 수 없어도 Reply 자체의 Post Visibility와 Post Eligibility를
  만족하면 Reply는 조회할 수 있다. Post 상세는 조회할 수 있는 조상 경로와 조회할 수 있는 모든 하위 Reply를
  제공한다.
- Repost는 Repost Source를 직접 참조하고 Kind가 Repost인 Post다. Repost Source는 Original, Reply 또는
  Quote이며 Repost는 Source가 될 수 없다. 다른 Post로 평탄화하지 않는다.
- 같은 Author Profile/Repost Source 조합에는 Active Repost가 하나만 존재한다. Repost 수는 해당 Source를
  직접 참조하는 eligible Active Repost만 포함한다.
- Public/Unlisted Post의 Repost는 Unlisted가 된다. Followers Only Post는 Source Author만 Repost할 수 있고
  결과도 Followers Only가 된다. Mentioned Profiles Post는 Repost할 수 없다.
- 같은 Profile/Post/Reaction Type 조합에는 Reaction이 하나만 존재하며 다른 Reaction Type은 함께 존재할 수
  있다.
- Reaction 조회 결과는 Reaction Type별 개수와 Reaction을 남긴 Profile 목록을 제공한다. Reaction Type은
  개수 내림차순으로 표시한다.
- Bookmark 목록은 최신 Bookmark부터 표시한다. 대상 Post를 조회할 수 없는 동안에는 목록에서 숨기되 Bookmark
  관계는 유지한다.
- Post/Reply/Quote에 연결하는 Media는 Local이어야 하고 Media의 Upload Account가 행동을 요청한 Account와
  같아야 한다. Media Profile과 Post Author Profile은 같은 Account 안에서 달라도 되며, Upload Account는
  연결되지 않은 Local Media를 조회할 수 있다.
- Reply, Reaction, Repost로 자기 Post에 새 Notification을 만들지 않는다. Reaction/Repost Notification은
  각각 원인 Reaction/Repost Post를 Source로 직접 참조한다. 원인 Reaction이 제거되거나 Repost가 Tombstone이면
  대응하는 Notification은 시점과 성공을 보장하지 않는 Best Effort 정리 대상이 된다.

이 ADR은 Quote의 Post Kind와 Source 계약을 변경하지 않는다. 위 Media 연결 조건은 Quote에도 적용한다.
초기 허용 Reaction Type 목록은 이 ADR에서 결정하지 않고 별도 도메인 결정이 소유한다.

## 대체한 결정

- [ADR 0002](./0002-pr-review-domain-adjustments.md)의 중첩 Repost 평탄화 결정을 직접 Source 참조와 Repost
  입력 거절 결정으로 대체한다.

## 문서 반영

- [Post](../objects/post.md)는 Reply/Repost 관계, 생성 조건, 상세 조회와 Repost 수를 정의한다.
- [Reaction](../objects/reaction.md)은 Reaction uniqueness와 조회 결과·순서를 정의한다.
- [Bookmark](../objects/bookmark.md)은 개인 목록 순서와 숨김 정책을 정의한다.
- [Media](../objects/media.md)는 Local Media를 Post에 연결할 Account 경계를 정의한다.
- [Notification](../objects/notification.md)은 자기 행동 알림 억제와 취소 시 Best Effort 제거를 정의한다.
