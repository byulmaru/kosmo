## Why

Kosmo는 Repost를 별도 Post Kind가 아니라 Content와 Reply Parent 없이 Repost Source를 직접 참조하는 Post 구조로 저장하고, 생성·취소·조회·목록·UI·Notification 전반에서 같은 관계 조합과 조회 정책을 적용해야 한다. [PROD-389](https://linear.app/byulmaru/issue/PROD-389/repost-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)의 구현 자식들이 하나의 제품 계약을 공유하므로 이를 하나의 OpenSpec change로 구체화한다.

## What Changes

- Repost와 Quote가 공유하는 nullable Repost Source self-reference를 Post에 추가하고, 관계 조합·Source 유효성·Active Repost 유일성을 검증한다.
- 허용된 Post를 Repost하는 멱등 core action과 GraphQL mutation, 기존 Post 삭제를 통한 멱등 취소를 제공한다.
- 기존 단일 GraphQL `Post` Node에 nullable `repostSource`, viewer-independent `repostCount`, 현재 selected Profile의 Active Repost identity를 제공한다.
- Home과 Profile Post List가 Repost와 Source 양쪽의 조회 정책을 적용해 후보를 선정하고, Hashtag Post List에서는 Content 없는 Repost를 제외한다.
- Repost·Quote 프레젠테이션과 Source 이동을 제공하고, selected Profile별 Repost action adapter가 공용 `PostActionBar` config로 상태·pending·오류 callback을 연결한다. 생성 cache 동기화와 취소 실행 뒤 후속 취소 cache 동기화는 분리한다.
- 자기 Post 알림을 억제하면서 Repost Notification을 기존 inbox·Unread count·Read·Node 계약에 통합하고, Repost가 Tombstone이 된 뒤 Notification을 Best Effort로 정리한다.
- 공용 `PostActionBar` UI는 PROD-433을 재사용하고, 여러 action을 실제 production surface에 조립하며 접근 가능한 한국어 오류 toast를 제공하는 rollout은 PROD-432의 별도 계약으로 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`
- Linear Contract: [PROD-389](https://linear.app/byulmaru/issue/PROD-389/repost-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)
- Linear Implementations: [PROD-394](https://linear.app/byulmaru/issue/PROD-394/repost%EC%99%80-quote%EA%B0%80-%EA%B3%B5%EC%9C%A0%ED%95%98%EB%8A%94-source%EB%A5%BC-%EC%A0%80%EC%9E%A5%ED%95%9C%EB%8B%A4), [PROD-401](https://linear.app/byulmaru/issue/PROD-401/repost%EB%A5%BC-%EC%83%9D%EC%84%B1%ED%95%9C%EB%8B%A4), [PROD-402](https://linear.app/byulmaru/issue/PROD-402/repost%EC%99%80-quote%EA%B0%80-%EA%B3%B5%EC%9C%A0%ED%95%98%EB%8A%94-source%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4), [PROD-403](https://linear.app/byulmaru/issue/PROD-403/repostcount%EC%99%80-%ED%98%84%EC%9E%AC-profile%EC%9D%98-active-repost%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4), [PROD-411](https://linear.app/byulmaru/issue/PROD-411/repost%EB%A5%BC-%EC%B7%A8%EC%86%8C%ED%95%9C%EB%8B%A4), [PROD-412](https://linear.app/byulmaru/issue/PROD-412/repost-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-414](https://linear.app/byulmaru/issue/PROD-414/repost-action%EC%9D%84-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), [PROD-430](https://linear.app/byulmaru/issue/PROD-430/home%EA%B3%BC-profile-post-list%EC%97%90-repost-%ED%9B%84%EB%B3%B4-%EC%A0%95%EC%B1%85%EC%9D%84-%EC%A0%81%EC%9A%A9%ED%95%9C%EB%8B%A4), [PROD-415](https://linear.app/byulmaru/issue/PROD-415/post-%EB%AA%A9%EB%A1%9D%EC%97%90-repost%EB%A5%BC-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-416](https://linear.app/byulmaru/issue/PROD-416/repost-notification%EC%9D%84-%EC%A0%95%EB%A6%AC%ED%95%9C%EB%8B%A4), [PROD-453](https://linear.app/byulmaru/issue/PROD-453/repostquote-%EA%B2%8C%EC%8B%9C%EA%B8%80%EC%9D%98-%ED%94%84%EB%A0%88%EC%A0%A0%ED%85%8C%EC%9D%B4%EC%85%98-ui%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4), [PROD-471](https://linear.app/byulmaru/issue/PROD-471/repost-%EC%B7%A8%EC%86%8C-%ED%9B%84-source-post-%EC%BA%90%EC%8B%9C%EB%A5%BC-%EB%8F%99%EA%B8%B0%ED%99%94%ED%95%9C%EB%8B%A4)

## Capabilities

### New Capabilities

- `repost`: Repost Source 관계, 구조 판별, 저장 유일성, 생성·취소, Source·count·현재 Profile 상태 조회와 목록 후보 계약
- `post-repost-ui`: Repost·Quote 프레젠테이션, Source 이동, `PostActionBar`용 Repost action adapter의 상태·pending·오류 callback과 Relay cache 동기화 계약

### Modified Capabilities

- `data-model`: Post Repost Source self-reference와 Active Repost 유일성, Repost Notification source 저장 관계 추가
- `post`: Post 구조 조합, Repost Source·count·현재 Profile 상태와 Home/Profile/Hashtag 목록 후보 계약 확장
- `notification`: Repost source의 생성·조회·inbox 표시·읽음 처리와 Tombstone 뒤 Best Effort 정리 계약 추가

## Impact

- Linear: PROD-394, PROD-401, PROD-402, PROD-403, PROD-411, PROD-412, PROD-414, PROD-430, PROD-415, PROD-416, PROD-453, PROD-471과 부모 PROD-389
- Core/DB: Post self-reference, partial unique index, migration, 구조·Source 검증, Repost 생성·Tombstone lifecycle, Notification projection·정리
- GraphQL/API: Repost 생성·취소 mutation, `Post.repostSource`, count와 selected Profile별 Active Repost, 후속 취소 Source 상태 응답, Repost Notification concrete Node와 visibility
- Universal client: Repost·Quote presentation, Home/Profile 목록 연결, `PostActionBar`용 Repost action adapter와 Relay cache, Notification inbox·badge·navigation
- Dependency: `add-in-app-notifications`가 제공하는 active `notification`·`data-model`·`api-platform` 기반과 PROD-412의 선행 이슈 결과를 재사용한다. PROD-414는 최신 main을 반영한 PROD-433의 `prod-433` 위에 `prod-414`를 stack하고 Draft PR base를 `prod-433`으로 유지한다.
- Excluded systems: Quote 작성 action·전용 composer, ActivityPub federation delivery·Repost ingestion, Mentioned Profiles Repost, Post Media, 범용 Notification 재설계, retry/outbox/backfill, 공통 `PostActionBar` 구현, production full-bar 조립과 오류 toast
