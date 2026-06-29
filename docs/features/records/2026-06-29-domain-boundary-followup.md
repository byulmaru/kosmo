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

## 다음 질문 초안

1. Profile 상태 전이를 어느 수준까지 도메인 명세로 확정할지 결정해야 한다.
   - 초안: 활성 -> 비활성화는 `Owner`가 수행하고 되돌릴 수 있다.
   - 초안: 활성 또는 비활성화 -> 정지는 Trust & Safety moderation action으로 수행한다.
   - 초안: 정지 -> 활성 또는 비활성화는 Trust & Safety가 정지를 해제할 때 수행한다.
   - 초안: 비활성화 -> 삭제됨은 `Owner`가 요청하고, 삭제됨은 되돌릴 수 없는 terminal 상태로 둔다.
   - 추가 결정 필요: 활성 상태에서 바로 삭제됨으로 갈 수 있는지, 정지 상태의 Profile을 삭제할 수
     있는지, 삭제 대기 상태를 별도로 둘지 정해야 한다.
2. Domain moderation action taxonomy를 도메인 명세에 둘지 결정해야 한다.
   - 의미: Profile mute/block이 아니라 운영자 Account가 원격 도메인 또는 서버 전체에 적용하는
     moderation action의 종류와 효과를 뜻한다.
   - 초안: `Limit`은 공개 노출과 도달 범위를 줄이지만 완전히 없는 것으로 취급하지 않는다.
   - 초안: `Block`은 원격 Domain의 Profile, Post, Media, Notification, 관계 후보를 없는 것처럼
     취급한다.
   - 추가 결정 필요: `Limit`과 `Block`만 둘지, Domain moderation taxonomy 자체를 연합 구현 스펙으로
     제외할지 정해야 한다.
