# 2026-06-29 도메인 경계 후속 결정 기록

## 배경

컨텍스트 문서와 기록 문서를 다시 점검해 도메인 문서로 보기 어려운 미정 표현, 소유권 충돌, 후속 메모를
찾았다. 이번 답변에서 닫힌 결정은 [ADR 0005](../decisions/0005-domain-boundary-followup-clarifications.md)에
남겼다.

## 확정된 결정

1. Post와 Media의 연결, 첨부 순서, 첨부 해제, Post 단위 첨부 개수 제한은 Publishing이 소유한다.
2. Profile에 연결된 현재 avatar/header Media 참조는 Identity가 소유하고, 파일 원본과 crop 기준은
   Media가 소유한다.
3. Media의 사용 주체는 Profile이다. Account는 업로드와 보안 감사 기준으로 기록한다.
4. Follow Request는 별도 entity가 아니라 Follow Relationship의 요청 대기 상태다.
5. block, mute, limit, suspend가 발생해도 기존 Notification은 삭제하거나 상태를 바꾸지 않는다.
6. 검색 색인을 물리적으로 제거할지 query-time에 필터링할지는 현재 도메인 결정사항으로 두지 않는다.
7. Post List Control 적용 결과는 Home Post List, Profile Post List, Hashtag Post List별로 명시한다.
8. 팔로워/팔로잉 목록 공개 범위는 Identity가 소유한다.
9. Profile을 소유한다는 표현은 `Owner` 역할로 표현한다.
10. Alt Text는 Media 자체의 속성이다.
11. 삭제된 Post, 정지된 Author Profile의 Post, 차단 관계 때문에 접근할 수 없는 Post에는 답글을 작성할
    수 없다. 뮤트만으로는 답글 작성을 제한하지 않는다.
12. 특정 키워드나 미디어 유형을 근거로 Content Warning을 요구하는 정책은 현재 두지 않는다.
13. 해시태그 자동완성은 현재 Discovery 범위에서 제외한다.

## 후속 처리

Profile 상태 전이와 Domain moderation action taxonomy 질문은
[2026-06-29 상태 기계와 Domain moderation 결정 기록](./2026-06-29-state-moderation-followup.md)에서
닫혔다.
