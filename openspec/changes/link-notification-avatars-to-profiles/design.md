## Current Constraints

조사 기준은 `main`의 `6681db72670757f53e130a599114a38a6217a55c`다.

- `NotificationListItemView.tsx`의 `Actor`에는 프로필 주소가 없다. `NotificationTarget`의 사진은 게시글
  `Link` 안에 있어 따로 활성화할 수 없다.
- `NotificationListItem.tsx`의 Reaction/Repost는 행위자의 `profile.relativeHandle`을 선택하지 않는다.
  게시글 주소는 `post.profile.relativeHandle`과 `post.id`로 만든다. 두 Profile은 구분해서 사용해야 한다.
- `apps/api/schema.graphql`은 이미 `Profile.relativeHandle: String!`을 제공한다. 서버 API·DB 변경은 필요하지 않다.
- 실제 Reaction/Repost 목록은 각각 행위자 한 명을 전달한다. 표시 컴포넌트는 입력 순서대로 최대 3명을 표시한다.
  복수 사진 검증을 위해 서버 집계 기능을 추가하지 않는다.
- `useNotificationRead`는 기존 mutation을 기다리지 않고 시작한다. 성공 payload는 Notification과 Recipient Profile의
  normalized record를 갱신하며 오류에서는 이동을 되돌리지 않는다.

## Practical Approach

아래 내용은 현재 계약에 맞춘 구현 메모다. 구현 중 더 단순한 방법을 찾으면 바꿀 수 있다.

| 경계               | 작업 방향                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 실제 목록 consumer | Reaction/Repost fragment에 기존 행위자 `relativeHandle`을 선택하고 사진의 프로필 주소를 전달한다.                                                |
| 표시 입력          | Reaction/Repost의 각 사진에 목적지가 빠지지 않도록 타입을 정리한다. Follow 계열 입력은 기존 사용을 보존한다.                                     |
| 이동 영역          | 정적 알림 surface 아래에 사진 링크와 게시글 링크를 분리한다. 다른 목적지의 interactive element를 서로 중첩하지 않는다.                           |
| 읽음 처리          | 사진과 게시글 활성화는 해당 consumer의 기존 읽음 callback을 각각 한 번 호출한다. 읽음 요청의 in-flight 상태를 새 이동 차단 조건으로 쓰지 않는다. |
| 접근성             | 링크가 행위자 이름·프로필 식별과 이동 의미를 소유한다. 사진의 장식 정보가 보조 기술에 중복 전달되지 않게 한다.                                   |
| 배치               | 사진은 28px와 최대 3개 표시를 유지한다. 겹침을 제거하고 Web·iOS·Android의 기존 입력 기준에 맞는 비중첩 영역을 확보한다.                          |

요약·시각·미리보기·썸네일의 기존 게시글 목적지, CW·sensitive 처리와 알림 전체의 Read/Unread·hover 표시는 유지한다.
기존 `disabled`/`pending`에서는 사진과 게시글을 모두 차단한다. Post가 없을 때의 기존 consumer 차단도 유지한다.
Reply/Mention/Quote의 게시글 조합과 Follow/FollowRequest·Operational 경로는 이번 개선에 맞춰 재구성하지 않는다.

## Alternatives and Traps

- 부모 게시글 링크에 사진 링크를 중첩하고 이벤트 전파만 막는 방식은 Web 링크 의미와 Native responder 동작의 차이를 남긴다.
  영역을 분리해 한 입력이 두 이동·읽음 요청을 발생시키지 않게 한다.
- 사진을 모두 첫 행위자의 주소에 연결하면 복수 사진 계약을 위반한다. 각 입력의 Profile 주소를 사용한다.
- 별도 profile query, navigation history, ref/effect 기반 coordinator나 읽음 retry 상태 기계는 이 결과에 필요하지 않다.
  기존 Relay fragment·mutation과 Expo Router 경계를 사용한다.

## Risks / Limits

- 320px 폭에서 최대 3개 Native 입력 영역과 시각의 배치, 긴 이름·handle과 font scaling을 확인해야 한다.
- Web의 Ctrl/Cmd 새 탭·주소 복사·Enter 활성화와 실제 URL을 검증한다. Storybook callback 횟수만으로 실제 경로를 증명하지 않는다.
- TestFlight `0.0.1 (36836991687001)`·iOS `26.7`과 OTA revision은 이번 세션에서 직접 확인하지 않았다.
  이 환경 정보는 Linear의 제보이며, 이번 증거는 현재 코드 조사다.
- API·DB migration과 feature flag는 계획에 포함하지 않는다. 변경 철회는 해당 클라이언트 변경을 되돌리는 범위이며,
  OTA·바이너리 전달 방식은 기존 릴리스 절차를 따른다.

## Open Questions

제품·디자인 선택은 남아 있지 않다. 사진 겹침 제거는 2026-10-10 사용자가 선택했으며 기준 문서와 Linear에 반영했다.
전체 계획의 승인과 구현 시작은 다음 인계 단계로 남긴다.
