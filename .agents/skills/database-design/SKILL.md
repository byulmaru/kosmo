---
name: database-design
description: kosmo 프로젝트의 PostgreSQL/Drizzle 데이터베이스 스키마를 설계하거나 리뷰할 때 사용한다. ID 전략, UUID v7 타입 코드, GraphQL Relay ID 표현, 네이밍 컨벤션, 미디어/파일 테이블 분리, 게시글 콘텐츠 버전, 소프트 딜리트, ActivityPub/AT Protocol 데이터 경계, MVP와 후속 마이그레이션 분리를 점검한다.
---

# Database Design

이 스킬은 kosmo 프로젝트의 DB 리뷰 관점을 재사용 가능한 설계 체크리스트로 적용할 때 사용한다.

## 기본 태도

- DB 스키마는 제품 정책, 외부 API 표현, 저장소 구현을 성급하게 결합하지 않는다.
- 지금 필요한 기능만 직접 표현하되, 나중에 바꾸면 마이그레이션 비용이 큰 경계는 초기에 잡는다.
- 정답을 단정하기보다 선택지, 장단점, 지금 결정할 것, 나중에 미룰 것을 분리한다.
- PostgreSQL과 Drizzle ORM에서 실제로 구현 가능한 형태로 제안한다.

## 리뷰 순서

1. PRD, 사용자 시나리오, 현재 스키마, 아키텍처 문서를 먼저 읽는다.
2. 핵심 도메인 엔티티, 소유 관계, 생명주기 상태, 고빈도 조회 경로를 식별한다.
3. 각 테이블이 UI 화면이나 임시 구현이 아니라 오래 남을 도메인 개념인지 확인한다.
4. ID, 네이밍, FK, unique constraint, index, 삭제 정책, 외부 API 표현을 점검한다.
5. MVP에 필요한 스키마와 후속 마이그레이션으로 미룰 스키마를 나눈다.
6. 마지막에는 추천 방향, 구체 변경안, 보류할 결정, 열린 질문을 짧게 정리한다.

## 기본 컨벤션

- PostgreSQL 테이블과 컬럼은 `snake_case`를 사용한다.
- 테이블 단수/복수 규칙은 프로젝트 안에서 하나로 통일한다.
- 모든 주요 테이블은 별도 surrogate `id` PK를 가진다.
- 이메일, OIDC subject, handle, URL 같은 비즈니스 식별자는 PK로 쓰지 않고 unique constraint로 보호한다.
- 상태가 늘어날 수 있으면 boolean보다 enum/status 컬럼을 우선한다.
- 변경 가능한 도메인 테이블에는 `created_at`, `updated_at`을 둔다.
- 삭제가 생명주기의 일부인 테이블에만 `deleted_at`을 둔다.
- FK는 실제 join, filtering, pagination, cleanup job에서 쓰이는 경로를 기준으로 index를 설계한다.

## ID 전략

DB PK는 UUID v7 + PostgreSQL `uuid` 타입을 우선 검토한다. 문자열 prefix 대신 UUID v7의 구현 재량 영역 일부를 테이블 타입 코드로 예약한다.

권장 방향:

- DB에는 UUID v7을 저장하고 PostgreSQL에서는 `uuid` 타입을 우선 검토한다.
- 정렬성과 분산 ID 생성이 모두 필요하면 UUID v7을 우선 후보로 둔다.
- PostgreSQL 버전이 UUID v7 생성을 직접 지원하지 않아도 웹 서버/애플리케이션에서 UUID v7을 생성해 저장할 수 있다.
- GraphQL Relay Node ID의 타입 구분을 위해 UUID v7의 random/implementation-defined 영역 일부를 테이블 타입 코드로 예약한다.
- 예: `account=0`, `application=1`, `application_secret=2`, `session=3`, `profile=4`.
- UUID version bit, variant bit, timestamp bit는 변경하지 않는다.
- 모든 ID 생성은 공통 `generateId(tableType)` 유틸리티를 통해 수행한다.
- 모든 타입 판별은 공통 `decodeIdType(id)` 유틸리티를 통해 수행한다.
- GraphQL global ID는 opaque string을 유지하되, Node resolver는 UUID 내부 타입 코드를 읽어 대상 테이블을 결정할 수 있다.

prefixed text PK를 쓰려면 먼저 다음을 문서화한다.

- GraphQL/API 레이어 처리로 부족한 이유
- 운영상 ID prefix가 반드시 필요한 이유
- text join/index 비용을 감수할 근거
- UUID v7 타입 코드 방식, ULID, prefixed ULID 간 benchmark와 유지보수 비용

## 관계 모델링

- N:N 관계에 role, state, order, timestamp, 권한이 붙으면 명시적 조인 테이블로 둔다.
- 관계 맥락에 따라 달라지는 값은 조인 테이블에 둔다.
- 예: 게시물별 `alt_text`, `position`, `sensitivity`, 썸네일 `focus_x/focus_y`는 `post_media`에 둔다.
- 초기 스키마에서는 polymorphic FK를 피하고, 관계별 명시 테이블을 우선한다.
- ActivityPub actor 상세, inbox/outbox queue, AT Protocol record/cache는 구현 경로가 구체화된 뒤 추가한다.

## 미디어와 파일

미디어는 아래 책임을 분리해 설계한다.

- `file_object`: Object Storage에 저장된 실제 파일
- `media_asset`: 사용자가 업로드한 논리적 미디어
- `media_variant`: 썸네일, 압축본, 리사이즈, WebP/AVIF 등 파생 파일
- `post_media` / `profile_media`: 게시물/프로필에서 해당 미디어를 쓰는 맥락

원본 파일을 저장한다고 해서 원본 URL을 그대로 제공하지 않는다. 타임라인은 썸네일/압축본, 상세는 고해상도 variant, 원본 제공은 별도 제품/비용 정책으로 판단한다.

kosmo 특화 예시는 `references/kosmo-db-review.md`를 읽는다.

## 삭제 정책

- 사용자에게 보이는 도메인 객체는 soft delete를 우선 검토한다.
- 파일과 미디어는 `deleted_at` 표시 후 grace period를 거쳐 물리 삭제한다.
- 세션, 앱 시크릿은 hard delete보다 revoke/expire 상태를 우선한다.
- ActivityPub/Fediverse 연동 객체는 tombstone, Delete activity, remote sync 요구사항을 고려한다.
- `ON DELETE CASCADE`는 편의가 아니라 정책이다. 감사, 모더레이션, 연합, 비용 정산에 필요한 row인지 먼저 확인한다.

## 답변 형식

스키마 설계나 리뷰 요청에는 아래 형식을 우선 사용한다.

```md
**추천 방향**
짧은 결론.

**스키마 변경안**
- 테이블/컬럼/constraint/index 단위 변경.

**지금 결정할 것**
- 나중에 바꾸기 비싼 결정.

**후속으로 미룰 것**
- 정책이나 UX가 더 정해진 뒤 추가해도 되는 것.

**열린 질문**
- 제품/인프라 결정이 필요한 질문.
```
