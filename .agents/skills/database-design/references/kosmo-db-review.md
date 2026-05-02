# Kosmo DB Review Reference

kosmo/byulmaru SNS 스키마 또는 유사한 PostgreSQL + Drizzle + GraphQL + ActivityPub/AT Protocol 기반 소셜 제품을 설계할 때 참고한다.

## 핵심 설계 원칙

- 초기 스키마는 SNS의 최소 뼈대에 집중한다: account, application, session, profile, account_profile, post, post_content, profile_follow.
- UX/정책이 아직 유동적인 기능은 후속 마이그레이션으로 미룬다: profile tag, theme, ActivityPub 상세 테이블, AT Protocol cache, moderation, notification, block/mute, media processing.
- 나중에 바꾸기 비싼 경계는 초기에 반영한다: account-profile N:N, post content versioning, profile-follow 방향성.
- DB 내부 ID, 외부 API ID, Object Storage key, CDN URL은 서로 다른 책임이다.

## 네이밍

- 테이블명, 컬럼명, enum명, FK명, index명 규칙을 문서화한다.
- `follow`처럼 범위가 넓은 이름보다 `profile_follow`처럼 대상이 드러나는 이름을 선호한다.
- 관계 방향은 컬럼명에 드러낸다: `follower_profile_id`, `followee_profile_id`.

## ID 전략

기존 후보였던 `PRFL0...` 같은 table prefix + ULID 저장 방식은 재검토한다.

권장 방향:

- DB PK에는 문자열 prefix를 저장하지 않는다.
- 내부 DB ID는 UUID v7 + PostgreSQL `uuid` 타입을 우선 후보로 둔다.
- PostgreSQL 조인, 인덱스 크기, 캐시 적중률, 최대 처리량을 고려하면 text ID보다 built-in `uuid` 타입을 우선 후보로 둔다.
- UUID v7은 시간순 정렬성과 분산 환경에서의 생성 편의성을 함께 제공하므로 UUID v4나 중앙 숫자 sequence보다 소셜 서비스의 분산 생성 모델에 잘 맞을 수 있다.
- PostgreSQL에서 UUID v7 생성 함수가 없는 버전을 쓰더라도 웹 서버/애플리케이션에서 UUID v7을 생성해 insert하면 된다.
- PostgreSQL 18 이상처럼 UUID v7 생성 지원이 있는 환경에서는 DB 생성도 선택지로 검토할 수 있다.
- ULID와 UUID v7은 모두 timestamp 기반 128-bit ID로 볼 수 있지만, DB 저장 타입은 PostgreSQL native `uuid`를 우선 검토한다.
- GraphQL Relay Node ID의 오브젝트 타입 구분은 UUID v7의 random/implementation-defined 영역 일부를 테이블 타입 코드로 예약해 처리한다.
- GraphQL global ID는 opaque string을 유지하되, Node resolver는 UUID 내부 타입 코드를 읽어 대상 테이블을 결정한다.
- API 응답/로그에서 타입 식별이 필요하면 같은 타입 코드를 사람이 읽기 쉬운 타입명으로 매핑한다.

UUID v7 타입 코드 정책:

- UUID version bit와 variant bit는 절대 변경하지 않는다.
- timestamp 영역도 변경하지 않는다. 시간순 정렬성을 유지해야 한다.
- 타입 코드는 UUID v7의 random/implementation-defined 영역 중 고정 위치 일부에 저장한다.
- 타입 코드 bit 폭은 초기에 넉넉히 잡는다. 예: 8bit면 256개 타입, 12bit면 4096개 타입.
- 타입 코드가 충돌 방지용 랜덤 영역을 줄인다는 점을 문서화하고, 남은 랜덤 bit로 충분한지 계산한다.
- 모든 ID 생성은 공통 `generateId(tableType)` 유틸리티를 통해서만 수행한다.
- 모든 decode는 공통 `decodeIdType(id)` 유틸리티를 통해서만 수행한다.
- DB에는 여전히 PostgreSQL `uuid` 타입으로 저장한다. 문자열 prefix는 쓰지 않는다.

초기 타입 코드 예시:

| Code | 테이블 | 설명 |
|---:|---|---|
| `0` | `account` | OIDC 계정과 매핑되는 로그인 단위 |
| `1` | `application` | kosmo에 접속하는 앱/클라이언트 |
| `2` | `application_secret` | 애플리케이션 시크릿 |
| `3` | `session` | 계정 + 애플리케이션 세션 |
| `4` | `profile` | SNS에서 보이는 프로필 |
| `5` | `account_profile` | 계정과 프로필의 연결 |
| `6` | `post` | 게시물 메타데이터 |
| `7` | `post_content` | 게시물 본문 버전 |
| `8` | `profile_follow` | 프로필-프로필 팔로우 |
| `9` | `file_object` | Object Storage 파일 |
| `10` | `media_asset` | 업로드된 논리 미디어 |
| `11` | `media_variant` | 썸네일/프리뷰 등 파생 파일 |
| `12` | `post_media` | 게시물-미디어 연결 |

GraphQL Relay 적용:

- Relay global ID는 opaque string이어야 한다.
- 내부 payload는 UUID 하나만 담거나, `typeCode:id`를 담을 수 있다.
- UUID 하나만 담는 경우 Node resolver가 UUID 타입 코드를 읽어 대상 테이블을 결정한다.
- `typeCode:id`를 담는 경우 payload의 typeCode와 UUID 내부 typeCode가 일치하는지 검증한다.
- 클라이언트는 UUID 구조나 type code를 알 필요가 없다.

벤치마크 후보:

- `TEXT prefix + ULID`
- `CHAR(26) ULID`
- `UUID v7`
- `UUID v7` 타입 코드 bit 예약 방식

확인할 쿼리:

- `post.profile_id -> profile.id` 조인
- `post_media.media_asset_id -> media_asset.id` 조인
- `(profile_id, created_at DESC)` 타임라인 페이지네이션
- GraphQL Node ID decode 후 단건 조회
- index size, query plan, insert locality, cache hit ratio, maximum throughput

## 기본 테이블 책임

- `account`: OIDC 계정과 kosmo 내부 계정 연결. 인증 비밀은 OIDC 서버가 책임진다.
- `application`: 세션이 어느 앱/클라이언트에서 발급됐는지 추적한다.
- `application_secret`: 시크릿 교체/폐기를 위해 1:N. 원문 secret은 저장하지 않는다.
- `session`: account, application, token hash, state, expiry, active profile을 가진다.
- `profile`: 글쓰기/팔로우/연합의 주체인 사회적 정체성.
- `account_profile`: account-profile N:N 관계와 role.
- `post`: 게시물 메타데이터, visibility, state, current content pointer.
- `post_content`: 본문 revision. `(post_id, revision_number)` unique.
- `profile_follow`: follower/followee 방향성과 pending/accepted/rejected 상태.

## 미디어 모델

창작자/SNS 미디어는 파일, 논리 미디어, 파생본, 사용 맥락을 분리한다.

- `file_object`: 실제 Object Storage 파일. `storage_key`, `mime_type`, `byte_size`, `sha256`, `width`, `height`, `deleted_at`.
- `media_asset`: 사용자가 업로드한 논리적 미디어. 원본 `file_object`를 참조.
- `media_variant`: 썸네일, preview, compressed, resized, WebP/AVIF, blur preview.
- `post_media`: 게시물에서 미디어를 쓰는 맥락. `position`, `alt_text`, `sensitivity`, `focus_x`, `focus_y`.
- `profile_media`: 아바타/배너처럼 프로필에서 미디어를 쓰는 맥락이 필요할 때 추가한다.

중복 업로드 방지는 먼저 목적을 구분한다.

- 내부 용량 절감 최적화인가?
- 사용자의 "최근 올린 이미지 다시 사용" 기능인가?
- 업로드 성능을 희생할 만큼 가치가 있는가?
- 화질/크기/메타데이터가 달라진 파일을 같은 이미지로 볼 것인가?

이미지 처리 서버/worker가 할 일:

- 원본 업로드 finalize
- 썸네일 생성
- 압축 이미지 생성
- 해상도별 variant 생성
- WebP/AVIF 등 최적화 포맷 생성
- blurhash/placeholder 생성
- CDN cache key 또는 variant key 기준 캐싱

원본 제공 정책:

- 일반 타임라인은 썸네일/압축본을 제공한다.
- 상세 화면은 고해상도 variant를 제공할 수 있다.
- 원본 보기는 MVP 기본값으로 두지 않는다.
- 원본 제공은 비용과 제품 목적에 따라 유료 기능 또는 별도 창작물 플랫폼 확장으로 분리할 수 있다.

썸네일 정책:

- 초기에는 중앙 crop으로 시작한다.
- 창작자 이미지 특성상 장기적으로 `focus_x`, `focus_y`를 둘 수 있다.
- 자동 중심 인식이 창작자 의도와 다를 수 있으므로 수동 포커스 지정이 더 안전할 수 있다.
- 포커스 값이 게시물 맥락마다 달라질 수 있으면 `post_media`에 둔다.

예시:

```sql
CREATE TABLE file_object (
  id UUID PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  sha256 TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE media_asset (
  id UUID PRIMARY KEY,
  uploader_account_id UUID NOT NULL REFERENCES account(id),
  original_file_id UUID NOT NULL REFERENCES file_object(id),
  kind media_kind NOT NULL,
  state media_state NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE media_variant (
  id UUID PRIMARY KEY,
  media_asset_id UUID NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
  file_object_id UUID NOT NULL REFERENCES file_object(id),
  variant_key TEXT NOT NULL,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (media_asset_id, variant_key)
);

CREATE TABLE post_media (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_asset(id),
  position INT NOT NULL,
  alt_text TEXT,
  sensitivity media_sensitivity NOT NULL,
  focus_x NUMERIC(4,3),
  focus_y NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (post_id, media_asset_id),
  UNIQUE (post_id, position)
);
```

## 소프트 딜리트와 정리 작업

- `post`: federation tombstone, moderation, user restore 정책이 있으면 `state`와 `deleted_at`을 둔다.
- `media_asset`, `file_object`: 삭제 표시 후 grace period가 지난 뒤 물리 삭제한다.
- `session`, `application_secret`: revoke/expire timestamp로 관리한다.
- `post_media` 같은 연결 row는 정책상 감사/복구가 필요 없으면 cascade 가능하지만, post/media 삭제 정책과 함께 검토한다.

## 리뷰 체크리스트

- 비즈니스 식별자를 PK로 쓰고 있지 않은가?
- DB 내부 ID와 GraphQL/REST 외부 ID가 분리되어 있는가?
- prefix ID가 정말 DB에 저장되어야 하는 이유가 있는가?
- GraphQL 타입 구분을 위해 UUID v7 타입 코드 bit 예약 방식을 적용했는가?
- UUID version/variant/timestamp bit를 건드리지 않는 생성 규칙을 문서화했는가?
- 테이블 타입 코드 표가 있고, 코드 추가/폐기 정책이 있는가?
- UUID v7 + PostgreSQL `uuid` 타입을 우선 후보로 검토했는가?
- enum/status가 가까운 미래의 상태 확장을 감당하는가?
- N:N 관계에 role/state/order/timestamp가 있으면 조인 테이블로 표현했는가?
- 삭제 정책이 테이블별로 명확한가?
- 원본 파일, 미디어 asset, variant, 사용 맥락이 분리되어 있는가?
- CDN URL과 Object Storage key 책임이 섞이지 않았는가?
- ActivityPub/AT Protocol 상세 데이터는 구현 필요가 구체화된 뒤 추가하도록 분리했는가?
- MVP 스키마가 작지만, 나중에 바꾸기 비싼 경계를 놓치지 않았는가?
