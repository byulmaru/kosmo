# ADR 0004: Review Consistency Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

- Followers Only Post는 Author, Author를 팔로우한 Profile, Mentioned Profile이 볼 수 있다.
- Home Post List는 Original/Quote 후보와 제한된 Reply 후보를 구분해 계산한다.
- Repost 후보에는 Repost Author와 Source Post Author 양쪽의 Profile Block/Profile Mute를 적용한다.
- 여러 Control Decision이 겹치면 `Exclude > Collapse > Include` 순서로 결합한다.
- Profile lifecycle과 운영자 suspension은 서로 다른 상태 차원이다.
- Profile Mute는 기존 Notification Item을 삭제하거나 Read State를 바꾸지 않는다.
- Word Mute Rule과 Hashtag Mute Rule은 선택된 Mute Scope에서만 소비한다.
- Post 검색 후보는 Public Post 중 Post Eligibility를 통과한 대상이다.
- Profile 검색 후보는 공개 조회 정책을 통과하며 Domain Limit Instance의 Remote Profile은 제외한다.
- Hashtag Post List는 Public Original/Quote Post만 대상으로 한다.
- Profile Domain Block은 Post List와 검색뿐 아니라 직접 Profile/Post/Media 조회에도 적용한다.

## 문서 반영

- [Post](../objects/post.md)는 직접 조회와 검색 후보 조건을 정의한다.
- [Post List Policy](../policies/post-list.md)는 목록별 후보와 제어 결합을 정의한다.
- [Profile](../objects/profile.md)은 lifecycle/suspension 상태를 분리한다.
- 개인 제어 객체는 각각 적용 Scope와 기존 Notification 보존 규칙을 명시한다.
