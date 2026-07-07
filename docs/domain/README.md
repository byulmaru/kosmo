# Kosmo 도메인 명세

## 목적

이 문서는 Kosmo를 단문형 SNS 제품으로 만들기 위해 필요한 도메인 객체, 상태, 속성, 관계, 행동, 권한,
불변 조건을 정리한 원천 명세다.

이 문서는 구현 스펙이 아니라 제품과 구현이 함께 참조해야 하는 도메인 정의 문서다. 구현 스펙과 OpenSpec은
이 문서의 보편 언어, 객체 소유권, 정책 결정을 따른다.

## 기준

- Kosmo의 보편 언어를 먼저 확정하고, 확정된 용어를 모든 문서에서 일관되게 사용한다.
- 기능 후보가 아니라 객체, 상태, 행동, 권한, 불변 조건을 기준으로 문서를 유지한다.
- 단순 기술 레이어는 도메인 객체로 분리하지 않는다. GraphQL, DB, 캐시, 인프라, 디자인 시스템은 각
  기능을 구현하기 위한 내부 수단이다.
- 테이블, 컬럼, resolver, endpoint, cache key 같은 구현 세부는 도메인 문서에 직접 적지 않는다.
  필요하면 객체가 가져야 할 속성, 상태, 생명주기, 권한, 정책 제약으로 번역해서 기록한다.
- 현재 구현 상태나 코드 감사 결과는 이 문서의 중심 주제가 아니다. 구현과 문서가 다르면 별도 구현
  스펙, OpenSpec, 이슈, PR 설명에서 정렬한다.
- 파일은 durable 객체당 하나를 원칙으로 한다. 값 객체와 정책 값은 소유 객체 문서 안에 둔다.

## 폴더 구조

- `objects/`: durable 객체별 도메인 명세.
- `decisions/`: 확정된 도메인 용어와 모델 결정을 ADR 형태로 보관한다.
- `records/`: 명세 점검 기록, 불일치 목록, 다음 질문 후보를 보관한다.

`records/`는 현재 canonical 명세가 아니라 특정 시점의 점검, 질문, 결정 이력을 보존하는 감사 기록이다.
후속 결정으로 의미가 바뀐 과거 문장을 최신 표현으로 덮어쓰지 않는다. 현재 도메인 명세는 `objects/`와
`decisions/`의 accepted ADR을 기준으로 읽고, `records/`는 어떤 맥락에서 결정이 내려졌는지 추적할 때
참조한다.

## 객체 문서 형식

각 객체 문서는 다음 관점으로 유지한다.

- 정의: 객체가 대표하는 도메인 개념과 책임.
- 상태: 객체가 가진 상태 차원과 상태 값. 상태 차원은 enum type처럼, 값은 enum value처럼 명명한다. 상태
  전이는 행동에 기록한다.
- 속성: 객체가 가진 스칼라 값. 타입, nullable 여부, 검증 정책, 상태별 존재 조건, 조회 권한을 기록한다.
- 관계: 다른 객체와의 연결. 방향, cardinality, 존재 조건, 조회 권한을 기록한다.
- 행동: 객체의 상태, 속성, 관계 또는 객체 자체를 바꾸는 mutation. 행동 주체, 대상 객체, 입력값,
  도메인 조건, 변경 결과를 기록한다.
- 권한: 이 객체가 소유한 조회/행동 조건. 권한 이름은 ACL action이 아니라 주체/대상/관계/상태가 무엇인지를
  표현한다.
- 불변 조건: 상태 변경 전후 항상 지켜야 하는 도메인 규칙.
- 확정 용어: 제품, 설계, 코드에서 같은 뜻으로 써야 하는 핵심 용어.
- 제외/보류: 현재 도메인 범위에서 제외하거나 별도 스펙으로 분리한 항목.

## 객체 인덱스

| 객체                                                                  | 책임                                    | 주요 관계                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Account](./objects/account.md)                                       | 로그인과 운영자 행동의 기준             | [Profile](./objects/profile.md), [Account-Profile Membership](./objects/account-profile-membership.md)                                        |
| [Profile](./objects/profile.md)                                       | 공개 소셜 정체성과 기본 행동 주체       | [Account-Profile Membership](./objects/account-profile-membership.md), [Media](./objects/media.md)                                            |
| [Account-Profile Membership](./objects/account-profile-membership.md) | Account와 Profile의 역할 관계           | [Account](./objects/account.md), [Profile](./objects/profile.md)                                                                              |
| [Post](./objects/post.md)                                             | 게시 본문, 형식, 공개 범위, 후보성 정책 | [Profile](./objects/profile.md), [Media](./objects/media.md)                                                                                  |
| [Media](./objects/media.md)                                           | 논리적 미디어와 대체 텍스트             | [File](./objects/file.md), [Profile](./objects/profile.md), [Post](./objects/post.md)                                                         |
| [File](./objects/file.md)                                             | 물리 파일 원본과 파생 이미지            | [Media](./objects/media.md)                                                                                                                   |
| [Follow Relationship](./objects/follow-relationship.md)               | Profile 간 성립된 팔로우 관계           | [Profile](./objects/profile.md), [Notification Item](./objects/notification-item.md)                                                          |
| [Follow Request](./objects/follow-request.md)                         | 승인제 Profile 대상 팔로우 요청         | [Profile](./objects/profile.md), [Follow Relationship](./objects/follow-relationship.md), [Notification Item](./objects/notification-item.md) |
| [Reaction](./objects/reaction.md)                                     | Profile의 Post 이모지 반응              | [Profile](./objects/profile.md), [Post](./objects/post.md)                                                                                    |
| [Bookmark](./objects/bookmark.md)                                     | Profile의 개인 Post 저장                | [Profile](./objects/profile.md), [Post](./objects/post.md)                                                                                    |
| [Post List Definition](./objects/post-list-definition.md)             | 게시 목록 후보, 제어, 정렬, 읽기 위치   | [Post](./objects/post.md), [Profile Relation Rule](./objects/profile-relation-rule.md)                                                        |
| [Search Index](./objects/search-index.md)                             | 검색 가능 범위와 lookup 정책            | [Post](./objects/post.md), [Profile](./objects/profile.md), [Hashtag](./objects/hashtag.md)                                                   |
| [Hashtag](./objects/hashtag.md)                                       | 해시태그 식별과 해시태그 게시 목록 연결 | [Post](./objects/post.md), [Post List Definition](./objects/post-list-definition.md)                                                          |
| [Notification Item](./objects/notification-item.md)                   | 개별 알림과 읽음/처리 상태              | [Post](./objects/post.md), [Profile](./objects/profile.md), [Account](./objects/account.md)                                                   |
| [Profile Relation Rule](./objects/profile-relation-rule.md)           | Profile 단위 mute/block 관계 규칙       | [Profile](./objects/profile.md), [Post List Definition](./objects/post-list-definition.md)                                                    |
| [Word Mute Rule](./objects/word-mute-rule.md)                         | 단어 기반 개인 노출 제어                | [Profile](./objects/profile.md), [Post List Definition](./objects/post-list-definition.md), [Search Index](./objects/search-index.md)         |
| [Hashtag Mute Rule](./objects/hashtag-mute-rule.md)                   | Hashtag 기반 개인 노출 제어             | [Profile](./objects/profile.md), [Hashtag](./objects/hashtag.md), [Post List Definition](./objects/post-list-definition.md)                   |
| [Profile Domain Block](./objects/profile-domain-block.md)             | Profile 개인 원격 Instance 차단         | [Profile](./objects/profile.md), [Instance](./objects/instance.md)                                                                            |
| [Instance](./objects/instance.md)                                     | 원격 서버 식별과 Instance 상태          | [Profile](./objects/profile.md), [Post](./objects/post.md), [Media](./objects/media.md)                                                       |

## 결정과 기록

- [ADR 0001: Core Ubiquitous Language](./decisions/0001-core-ubiquitous-language.md)
- [ADR 0002: PR Review Domain Adjustments](./decisions/0002-pr-review-domain-adjustments.md)
- [ADR 0003: Policy Ownership Clarifications](./decisions/0003-policy-ownership-clarifications.md)
- [ADR 0004: Review Consistency Clarifications](./decisions/0004-review-consistency-clarifications.md)
- [ADR 0005: Domain Boundary Follow-up Clarifications](./decisions/0005-domain-boundary-followup-clarifications.md)
- [ADR 0006: State Rules and Domain Moderation](./decisions/0006-state-machine-and-domain-moderation.md)
- [ADR 0007: Spec Boundary and State Clarifications](./decisions/0007-spec-boundary-and-state-clarifications.md)
- [ADR 0008: Relationship and Report State Exclusions](./decisions/0008-relationship-report-state-exclusions.md)
- [2026-06-28 DDD 명세 점검 기록](./records/2026-06-28-ddd-spec-audit.md)
- [2026-06-29 결정 반영 기록](./records/2026-06-29-decision-round.md)
- [2026-06-29 PR 리뷰 반영 기록](./records/2026-06-29-pr-review-followup.md)
- [2026-06-29 정책 소유권 후속 결정 기록](./records/2026-06-29-policy-ownership-followup.md)
- [2026-06-29 Post List 용어 후속 결정 기록](./records/2026-06-29-post-list-terminology-followup.md)
- [2026-06-29 PR 리뷰 정합성 후속 기록](./records/2026-06-29-pr-review-consistency-followup.md)
- [2026-06-29 도메인 경계 후속 결정 기록](./records/2026-06-29-domain-boundary-followup.md)
- [2026-06-29 상태 기계와 Domain moderation 결정 기록](./records/2026-06-29-state-moderation-followup.md)
- [2026-06-29 명세 경계와 상태 후속 결정 기록](./records/2026-06-29-spec-boundary-state-followup.md)
- [2026-06-29 관계와 신고 상태 제외 결정 기록](./records/2026-06-29-relationship-moderation-state-exclusions.md)
