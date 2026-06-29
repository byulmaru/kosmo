# Kosmo DDD 도메인 명세

## 목적

이 문서는 Kosmo를 단문형 SNS 제품으로 만들기 위해 필요한 bounded context, 도메인 모델,
보편 언어, 정책, 불변 조건을 정리한 DDD 도메인 명세다.

이 문서는 구현 스펙이 아니라 제품과 구현이 함께 참조해야 하는 도메인 정의 문서다. 구현 스펙과
OpenSpec은 이 문서의 보편 언어, 컨텍스트 경계, 정책 결정을 따른다.

## 기준

- Kosmo의 보편 언어를 먼저 확정하고, 확정된 용어를 모든 문서에서 일관되게 사용한다.
- 기능 후보가 아니라 도메인 책임, 상태, 정책, 불변 조건을 기준으로 문서를 유지한다.
- 단순 기술 레이어는 기능으로 분리하지 않는다. GraphQL, DB, 캐시, 인프라, 디자인 시스템은
  각 기능을 구현하기 위한 내부 수단이다.
- 테이블, 컬럼, resolver, endpoint, cache key 같은 구현 세부는 기능 문서에 직접 적지 않는다.
  필요하면 도메인이 가져야 할 속성, 상태, 생명주기, 권한, 정책 제약으로 번역해서 기록한다.
- 현재 구현 상태나 코드 감사 결과는 이 문서의 중심 주제가 아니다. 구현과 문서가 다르면
  별도 구현 스펙, OpenSpec, 이슈, PR 설명에서 정렬한다.
- 파일은 도메인당 하나를 원칙으로 한다. 한 문서 안에서 하위 기능을 다루고, 도메인이 커져
  분리해야 할 때는 먼저 경계와 관계를 이 문서에서 재정의한다.
- 도메인 간 의존성은 각 문서의 `컨텍스트 관계` 섹션에 명시한다.

## 폴더 구조

- `contexts/`: bounded context별 도메인 명세. 파일 하나가 하나의 컨텍스트를 대표한다.
- `decisions/`: 확정된 도메인 용어와 모델 결정을 ADR 형태로 보관한다.
- `records/`: 명세 점검 기록, 불일치 목록, 다음 질문 후보를 보관한다.

## DDD 명세 기준

각 컨텍스트 문서는 다음 관점으로 유지한다.

- 컨텍스트 경계: 이 문서가 책임지는 업무 언어와 책임지지 않는 영역.
- 보편 언어: 제품, 설계, 코드에서 같은 뜻으로 써야 하는 핵심 용어.
- 핵심 모델: aggregate root, entity, value object 후보.
- 불변 조건: 상태 변경 전후 항상 지켜야 하는 도메인 규칙.
- 도메인 이벤트: 다른 컨텍스트가 반응할 수 있는 의미 있는 사건.
- 정책과 권한: 공개 범위, 접근 제한, 운영 정책, Account/Profile 설정처럼 모델을 제약하는 규칙.
- 컨텍스트 관계: upstream/downstream, 참조, 알림, projection 관계.

## 도메인 지도

| 컨텍스트       | 문서                                                   | DDD 성격                                                | 주요 연결                                                                                                                                              |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity       | [contexts/identity.md](./contexts/identity.md)         | 계정, 프로필, 원격 프로필 identity의 기준 컨텍스트      | [Social Graph](./contexts/social-graph.md), [Discovery](./contexts/discovery.md), [Trust & Safety](./contexts/trust-safety.md)                         |
| Publishing     | [contexts/publishing.md](./contexts/publishing.md)     | 게시 작성, 공개 범위, 답글, 내용 경고의 핵심 컨텍스트   | [Engagement](./contexts/engagement.md), [Post List](./contexts/post-list.md), [Media](./contexts/media.md), [Social Graph](./contexts/social-graph.md) |
| Media          | [contexts/media.md](./contexts/media.md)               | 게시/프로필에 연결되는 미디어와 파일 원본 컨텍스트      | [Publishing](./contexts/publishing.md), [Identity](./contexts/identity.md), [Trust & Safety](./contexts/trust-safety.md)                               |
| Social Graph   | [contexts/social-graph.md](./contexts/social-graph.md) | 팔로우, 팔로우 요청, 관계별 설정 컨텍스트               | [Identity](./contexts/identity.md), [Post List](./contexts/post-list.md), [Notification](./contexts/notification.md)                                   |
| Engagement     | [contexts/engagement.md](./contexts/engagement.md)     | 반응, 재게시, 북마크 같은 게시 행동 컨텍스트            | [Publishing](./contexts/publishing.md), [Social Graph](./contexts/social-graph.md), [Notification](./contexts/notification.md)                         |
| Post List      | [Post List](./contexts/post-list.md)                   | 게시 목록 정의와 홈/프로필/해시태그 projection 컨텍스트 | [Publishing](./contexts/publishing.md), [Social Graph](./contexts/social-graph.md), [Discovery](./contexts/discovery.md)                               |
| Discovery      | [contexts/discovery.md](./contexts/discovery.md)       | 검색, 원격 lookup, 추천, 탐색 컨텍스트                  | [Identity](./contexts/identity.md), [Publishing](./contexts/publishing.md), [Trust & Safety](./contexts/trust-safety.md)                               |
| Notification   | [contexts/notification.md](./contexts/notification.md) | 소셜/운영 알림과 읽음 상태 컨텍스트                     | [Engagement](./contexts/engagement.md), [Social Graph](./contexts/social-graph.md), [Publishing](./contexts/publishing.md)                             |
| Trust & Safety | [contexts/trust-safety.md](./contexts/trust-safety.md) | 뮤트, 차단, 신고, 서버 moderation 컨텍스트              | [Identity](./contexts/identity.md), [Publishing](./contexts/publishing.md), [Discovery](./contexts/discovery.md)                                       |

## 결정과 기록

- [ADR 0001: Core Ubiquitous Language](./decisions/0001-core-ubiquitous-language.md)
- [ADR 0002: PR Review Domain Adjustments](./decisions/0002-pr-review-domain-adjustments.md)
- [ADR 0003: Policy Ownership Clarifications](./decisions/0003-policy-ownership-clarifications.md)
- [2026-06-28 DDD 명세 점검 기록](./records/2026-06-28-ddd-spec-audit.md)
- [2026-06-29 결정 반영 기록](./records/2026-06-29-decision-round.md)
- [2026-06-29 PR 리뷰 반영 기록](./records/2026-06-29-pr-review-followup.md)
- [2026-06-29 정책 소유권 후속 결정 기록](./records/2026-06-29-policy-ownership-followup.md)

## 컨텍스트 관계 규칙

각 컨텍스트 문서는 `컨텍스트 관계` 섹션을 가진다.

- 상위: 이 인덱스 문서.
- upstream: 이 컨텍스트가 식별자, 상태, 정책 판단을 의존하는 컨텍스트.
- downstream: 이 컨텍스트의 이벤트나 상태 변경을 소비하는 컨텍스트.
- reference upstream: moderation처럼 판단 대상 엔티티를 참조하기 위해 의존하는 컨텍스트.
- policy upstream: 정책 판정이나 안전 규칙 결과를 의존하는 컨텍스트.
- policy downstream: 정책 판정이나 안전 규칙 결과를 소비하는 컨텍스트.
- peer: 상호 정책을 맞춰야 하지만 소유권은 분리된 컨텍스트.

## 공통 문서 형식

각 컨텍스트 문서는 다음 관점으로 읽는다.

- 목표: Account/Profile이 얻는 가치와 컨텍스트가 책임지는 변화
- 컨텍스트 관계: upstream/downstream/peer 관계
- DDD 명세: 경계, 보편 언어, 모델, 불변 조건, 이벤트, 정책
- 핵심 기능: 공통적으로 필요한 Account/Profile 행동
- 도메인 속성/정책 메모: 이후 구현 스펙으로 옮겨야 하는 결정
- 미결정 항목: 제품 이름, 정책, 포함 범위가 확정되지 않은 부분

// TODO: 디자인적 결정은 추후 디자인 문서로 이관할 것
