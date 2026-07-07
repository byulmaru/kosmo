# ADR 0005: Domain Boundary Follow-up Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

문서 점검에서 확인된 도메인 경계와 미정 표현을 다음처럼 정리한다.

- Post는 Media 연결, 첨부 순서, 첨부 해제, Post 단위 첨부 개수 제한을 소유한다.
- Media는 파일 원본, 파생 이미지, Media 자체의 Alt Text, avatar/header 표시용 crop 기준을 소유한다.
- 현재 Profile에 연결된 avatar/header Media 참조는 Profile이 소유한다.
- Media의 사용 주체는 Profile이다. Account는 업로드와 보안 감사 기준으로 기록한다.
- Follow Request는 별도 객체다.
- block, mute, limit, suspend가 발생해도 기존 Notification은 삭제하거나 상태를 바꾸지 않는다.
- 검색 색인을 물리적으로 제거할지 query-time에 필터링할지는 현재 도메인 결정사항으로 두지 않는다.
- Post List Control 적용 결과는 Home Post List, Profile Post List, Hashtag Post List별로 명시한다.
- 팔로워/팔로잉 목록 공개 범위는 [Profile](../objects/profile.md)이 소유하고
  [Follow Relationship](../objects/follow-relationship.md)의 목록 조회가 소비한다.
- Profile을 소유한다는 표현은 `Owner` 역할로 표현한다.
- Alt Text는 Media 자체의 속성이다.
- 삭제된 Post, 정지된 Author Profile의 Post, 차단 관계 때문에 접근할 수 없는 Post에는 답글을 작성할
  수 없다. 뮤트만으로는 답글 작성을 제한하지 않는다.
- 특정 키워드나 미디어 유형을 근거로 Content Warning을 요구하는 정책은 현재 두지 않는다.
- 해시태그 자동완성은 현재 Search Index와 Hashtag 범위에서 제외한다.

## 문서 반영

- [Post](../objects/post.md)는 Post-Media 연결과 답글 작성 제한 정책을 명시한다.
- [Media](../objects/media.md)와 [File](../objects/file.md)은 파일/파생 이미지/Alt Text와 Profile 사용
  주체를 명시한다.
- [Profile](../objects/profile.md)은 Profile 이미지 연결, 목록 공개 범위, `Owner` 편집 권한을 명시한다.
- [Follow Relationship](../objects/follow-relationship.md)은 성립된 팔로우 관계만 다룬다.
- [Follow Request](../objects/follow-request.md)는 팔로우 요청과 요청 상태를 다룬다.
- [Notification Item](../objects/notification-item.md)은 기존 Notification을 보존하는 정책을 명시한다.
- [Post List Definition](../objects/post-list-definition.md)은 Post List Control 적용 정책을 명시한다.
- [Hashtag](../objects/hashtag.md)은 해시태그 자동완성을 제외 범위로 둔다.
