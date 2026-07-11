# Kosmo 도메인 명세

## 목적

이 문서는 Kosmo를 단문형 SNS 제품으로 만들기 위해 필요한 도메인 객체, 상태, 속성, 관계, 행동, 권한,
조회 정책을 정리한 원천 명세다.

이 문서는 구현 스펙이 아니라 제품과 구현이 함께 참조해야 하는 도메인 정의 문서다. 구현 스펙과 OpenSpec은
이 문서의 보편 언어, 객체 소유권, 정책 결정을 따른다.

## 기준

- Kosmo의 보편 언어를 먼저 확정하고, 확정된 용어를 모든 문서에서 일관되게 사용한다.
- 기능 후보가 아니라 durable 객체와 그 객체가 소유한 상태, 속성, 관계, Mutation, 권한을 기준으로 문서를
  유지한다.
- 조회, 검색, 목록 계산처럼 객체를 바꾸지 않는 연산은 행동으로 기록하지 않는다. 여러 객체를 함께 소비하는
  계산 규칙은 조회 정책으로 기록한다.
- 단순 기술 레이어는 도메인 객체로 분리하지 않는다. GraphQL, DB, 캐시, 색인, 인프라, 디자인 시스템은 각
  기능을 구현하기 위한 내부 수단이다.
- 테이블, 컬럼, row, resolver, endpoint, cache key, storage key 같은 구현 세부는 도메인 문서에 직접 적지
  않는다.
- 파일은 durable 객체당 하나를 원칙으로 한다. 값 객체와 정책 값은 소유 객체 문서 안에 둔다.
- 확정하지 않은 타입이나 검증 정책을 placeholder로 canonical 본문에 두지 않는다. 확정 전 항목은
  `제외/보류`로 옮긴다.

## 폴더 구조

- `objects/`: durable 객체별 도메인 명세.
- `policies/`: durable 객체가 아닌 교차 객체 조회 정책.
- `decisions/`: 확정된 도메인 용어와 모델 결정을 ADR 형태로 보관한다.
- `records/`: 명세 점검 기록, 불일치 목록, 다음 질문 후보를 보관한다.

`records/`는 현재 canonical 명세가 아니라 특정 시점의 점검, 질문, 결정 이력을 보존하는 감사 기록이다.
후속 결정으로 의미가 바뀐 과거 문장을 최신 표현으로 덮어쓰지 않는다. 현재 도메인 명세는 `objects/`,
`policies/`, `decisions/`의 accepted ADR을 기준으로 읽는다.

## 객체 문서 형식

각 객체 문서는 다음 관점으로 유지한다.

- 정의: 객체가 대표하는 도메인 개념과 책임.
- 상태: 객체가 가진 상태 차원과 상태 값. 상태 차원은 enum type처럼, 값은 enum value처럼 명명한다. 상태
  전이와 전이 조건은 행동에 기록한다.
- 속성: 객체가 가진 스칼라 값. 이름 있는 타입, nullable 여부, 검증 정책, 존재 조건, 조회 조건, 조회 권한을
  기록한다.
- 관계: 다른 durable 객체와의 연결. 관계 소유 방향, cardinality, 존재 조건, 조회 조건, 조회 권한을
  기록한다.
- 행동: 객체의 상태, 속성, 관계 또는 객체 자체를 바꾸는 Mutation. 행동 주체, 대상 객체, 입력값, 권한,
  조건, 변경 결과를 기록한다.
- 권한: 주체가 대상에 대해 무엇인지 나타내는 사실. `Owner`, `Member`, `Author`, `Recipient`처럼
  주체/대상/관계/상태를 표현하고 `Visible`, `Manage`, `Eligible` 같은 능력이나 행동 결과를 표현하지 않는다.
- 조회 정책: 객체를 바꾸지 않는 조회, 검색, 노출 후보 계산 조건. 필요한 객체에만 둔다.
- 확정 용어: 제품, 설계, 코드에서 같은 뜻으로 써야 하는 핵심 용어.
- 제외/보류: 현재 도메인 범위에서 제외하거나 아직 확정하지 않은 항목.

별도 `불변 조건` 섹션은 두지 않는다. 행동 전제와 결과 보장은 행동에, 값 제약은 속성에, uniqueness와
cardinality는 관계에, 조회 제한은 조회 정책과 조회 조건에 둔다.

## 객체 인덱스

| 객체                                                                  | 책임                                    | 주요 관계                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Account](./objects/account.md)                                       | 로그인과 운영자 행동의 기준             | [Profile](./objects/profile.md), [Account-Profile Membership](./objects/account-profile-membership.md)   |
| [Profile](./objects/profile.md)                                       | 공개 소셜 정체성과 기본 행동 주체       | [Account-Profile Membership](./objects/account-profile-membership.md), [Instance](./objects/instance.md) |
| [Account-Profile Membership](./objects/account-profile-membership.md) | Account와 Local Profile의 역할 관계     | [Account](./objects/account.md), [Profile](./objects/profile.md)                                         |
| [Post](./objects/post.md)                                             | 게시 본문, 형식, 공개 범위, 후보성 정책 | [Profile](./objects/profile.md), [Media](./objects/media.md)                                             |
| [Media](./objects/media.md)                                           | 논리적 미디어와 대체 텍스트             | [File](./objects/file.md), [Profile](./objects/profile.md), [Post](./objects/post.md)                    |
| [File](./objects/file.md)                                             | 원본과 파생 파일 표현                   | [Media](./objects/media.md), [File](./objects/file.md)                                                   |
| [Follow Relationship](./objects/follow-relationship.md)               | Profile 간 성립된 팔로우 관계           | [Profile](./objects/profile.md)                                                                          |
| [Follow Request](./objects/follow-request.md)                         | 승인제 Profile 대상 팔로우 요청         | [Profile](./objects/profile.md), [Follow Relationship](./objects/follow-relationship.md)                 |
| [Reaction](./objects/reaction.md)                                     | Profile의 Post 이모지 반응              | [Profile](./objects/profile.md), [Post](./objects/post.md)                                               |
| [Bookmark](./objects/bookmark.md)                                     | Profile의 개인 Post 저장                | [Profile](./objects/profile.md), [Post](./objects/post.md)                                               |
| [Hashtag](./objects/hashtag.md)                                       | 정규화된 Hashtag와 Post 연결            | [Post](./objects/post.md)                                                                                |
| [Notification Item](./objects/notification-item.md)                   | 개별 알림과 읽음 상태                   | [Post](./objects/post.md), [Profile](./objects/profile.md), [Account](./objects/account.md)              |
| [Profile Mute](./objects/profile-mute.md)                             | Profile 단위 개인 노출 억제             | [Profile](./objects/profile.md)                                                                          |
| [Profile Block](./objects/profile-block.md)                           | Profile 간 상호작용 차단                | [Profile](./objects/profile.md)                                                                          |
| [Word Mute Rule](./objects/word-mute-rule.md)                         | 단어 기반 개인 노출 제어                | [Profile](./objects/profile.md)                                                                          |
| [Hashtag Mute Rule](./objects/hashtag-mute-rule.md)                   | Hashtag 기반 개인 노출 제어             | [Profile](./objects/profile.md), [Hashtag](./objects/hashtag.md)                                         |
| [Profile Domain Block](./objects/profile-domain-block.md)             | Profile 개인 원격 Instance 차단         | [Profile](./objects/profile.md), [Instance](./objects/instance.md)                                       |
| [Post Notification Mute](./objects/post-notification-mute.md)         | Profile별 Post thread 알림 억제         | [Profile](./objects/profile.md), [Post](./objects/post.md)                                               |
| [Instance](./objects/instance.md)                                     | 원격 서버 식별과 서버 상태              | [Profile](./objects/profile.md)                                                                          |

## 조회 정책

- [Post List Policy](./policies/post-list.md): Home, Profile, Hashtag Post List의 후보와 제어 결정.

## 결정과 기록

- [ADR 0001: Core Ubiquitous Language](./decisions/0001-core-ubiquitous-language.md)
- [ADR 0002: PR Review Domain Adjustments](./decisions/0002-pr-review-domain-adjustments.md)
- [ADR 0003: Policy Ownership Clarifications](./decisions/0003-policy-ownership-clarifications.md)
- [ADR 0004: Review Consistency Clarifications](./decisions/0004-review-consistency-clarifications.md)
- [ADR 0005: Domain Boundary Follow-up Clarifications](./decisions/0005-domain-boundary-followup-clarifications.md)
- [ADR 0006: State Rules and Instance States](./decisions/0006-state-machine-and-instance-states.md)
- [ADR 0007: Spec Boundary and State Clarifications](./decisions/0007-spec-boundary-and-state-clarifications.md)
- [ADR 0008: Relationship and Report State Exclusions](./decisions/0008-relationship-report-state-exclusions.md)
- [2026-06-28 DDD 명세 점검 기록](./records/2026-06-28-ddd-spec-audit.md)
- [2026-06-29 결정 반영 기록](./records/2026-06-29-decision-round.md)
- [2026-06-29 PR 리뷰 반영 기록](./records/2026-06-29-pr-review-followup.md)
- [2026-06-29 정책 소유권 후속 결정 기록](./records/2026-06-29-policy-ownership-followup.md)
- [2026-06-29 Post List 용어 후속 결정 기록](./records/2026-06-29-post-list-terminology-followup.md)
- [2026-06-29 PR 리뷰 정합성 후속 기록](./records/2026-06-29-pr-review-consistency-followup.md)
- [2026-06-29 도메인 경계 후속 결정 기록](./records/2026-06-29-domain-boundary-followup.md)
- [2026-06-29 상태 기계와 Instance 상태 결정 기록](./records/2026-06-29-state-moderation-followup.md)
- [2026-06-29 명세 경계와 상태 후속 결정 기록](./records/2026-06-29-spec-boundary-state-followup.md)
- [2026-06-29 관계와 신고 상태 제외 결정 기록](./records/2026-06-29-relationship-moderation-state-exclusions.md)
