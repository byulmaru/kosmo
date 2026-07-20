# ADR 0005: Domain Boundary Follow-up Clarifications

## 상태

Accepted

## 날짜

2026-06-29

다른 Profile Media 재사용 보류 결정은 [ADR 0010](./0010-post-interaction-contracts.md)의 같은 Upload
Account Local Media 허용과 다른 Account Media 제외 결정으로 대체되었다. 나머지 결정은 유지한다.

## 결정

- Post는 작성 시 Attached Media 관계와 순서를 원자적으로 만들며 게시 뒤 연결/해제를 지원하지 않는다.
- Media는 Profile 관계를 필수로 가진다. Local Media는 upload를 수행한 Local Profile과 Upload Account를,
  Remote Media는 원본 Remote Profile을 가진다.
- 다른 Profile의 Media 재사용 정책은 후속 결정 대상으로 둔다.
- 모든 Profile은 Profile Origin과 같은 Instance Type을 가진 Instance 관계를 필수로 가진다. Post와 Media의
  Instance는 각각 Author Profile과 Media Profile에서 파생한다.
- File은 Original/Derived 표현만 도메인에서 다루며 저장 위치와 URL은 구현 세부다.
- avatar/header의 현재 Media 참조는 Profile이 소유한다.
- Follow Request는 Follow Relationship과 별도 객체다.
- Profile Mute, Profile Block, Word Mute Rule, Hashtag Mute Rule, Profile Domain Block은 별도 객체다.
- Mute/Instance 상태가 바뀌어도 기존 Notification의 존재와 Read State는 바꾸지 않는다. Profile Block은
  함께 제거되는 Follow 객체를 직접 원인으로 가진 Notification만 제거한다.
- Pending Follow Request 취소는 대응하는 Follow Request Notification도 제거한다.
- Follow Approval Policy 변경은 기존 Pending Follow Request를 바꾸지 않는다. Open Policy에서 Follow
  Relationship을 만들 때 같은 조합의 Pending Request가 있으면 해당 Request와 Notification을 제거한다.
- Follow Relationship의 새 Post 알림 Preference 기본값은 false다. 직접 생성과 Follow Request 승인 모두 같은
  기본값을 사용한다.
- 검색 후보와 lookup 조건은 원본 Post/Profile/Hashtag/Instance 조회 정책에서 정의한다.
- Post List Control은 durable 객체가 아닌 [Post List Policy](../policies/post-list.md)에서 정의한다.
- Profile 팔로워/팔로잉 목록 공개 범위의 구체 값은 확정할 때까지 canonical 속성에서 제외한다.
- 삭제된 Post, 조회할 수 없는 Post에는 Reply를 작성할 수 없다. Profile Mute만으로 Reply를 막지는 않는다.
- Hashtag 자동완성은 현재 Hashtag 범위에서 제외한다.
- Local Profile 생성 시 표시 이름 입력이 없으면 handle을 표시 이름으로 사용한다.

## 문서 반영

- [Post](../objects/post.md)는 Post 생성 시 Media 관계와 Reply 조건을 정의한다.
- [Media](../objects/media.md)와 [File](../objects/file.md)은 논리 Media와 파일 표현 경계를 정의한다.
- [Profile](../objects/profile.md)은 Instance와 avatar/header 관계를 정의한다.
- [Follow Relationship](../objects/follow-relationship.md)과 [Follow Request](../objects/follow-request.md)는
  성립된 관계와 승인 요청을 분리한다.
- [Post List Policy](../policies/post-list.md)는 목록별 제어 결과를 정의한다.
