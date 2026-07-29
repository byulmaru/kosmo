## Why

7월 29일 오픈 베타에 필요한 Profile Tag가 기존 Profile 계약과 수정·공개 화면에 없어서, Local Profile Owner가 관심사를 구조화해 관리하거나 공개 Profile에서 이를 일관되게 보여 줄 수 없다. `PROD-523`에서 승인한 canonical Hashtag identity, 권한, visibility와 생명주기를 저장·API·Web·Android·iOS가 공유하는 하나의 전달 계약으로 구체화한다.

## What Changes

- Post와 Profile이 공유할 canonical Hashtag identity를 정의하고, `PROD-526`에서 그 저장 구조와 Profile이 최대 5개의 identity를 순서 있게 참조하는 Profile Tag 관계를 추가한다.
- 선택적 앞 `#`와 바깥 공백 제거, Unicode NFKC, locale 비종속 case folding, 1~20자 문자·숫자·밑줄 검증을 적용하고 정규화 뒤 중복된 전체 변경을 거부한다.
- Active Account의 Local Profile Owner가 기존 Profile 편집 action으로 다른 표현 값과 Profile Tag 전체 목록을 원자적으로 교체하게 한다.
- 공개 조회 가능한 Local Profile에만 저장 순서의 Profile Tag를 노출하고, 비활성화·정지 때 관계를 보존한 채 숨기며, 선행 `PROD-532`가 제공하는 Deactivated→Deleted lifecycle 경계에 해당 Profile 관계 cleanup을 통합한다.
- `PROD-491`의 controlled Profile Tag editor와 client validation을 재사용해 저장·Relay·재시도 상태에 연결하고, 공개 Profile의 bio 다음에 비대화형 TagChip 목록을 Web·Android·iOS에서 표시한다.
- Profile Tag 검색, TagChip navigation, 자동완성·추천·trend, Remote Profile Tag와 ActivityPub 표현은 별도 계약으로 남긴다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/design/profile-tags.md`
- Canonical Contract: `PROD-523` / PR #394
- Linear Change: `PROD-522`
- Linear Presentation Contributor: `PROD-491` (controlled editor·client validation·순서 변경의 최초 구현)
- Linear Implementations: `PROD-526` (저장·수정·조회 기반), `PROD-527` (수정·공개 화면 연결)
- Linear Dependency: `PROD-532` (Local Profile의 terminal Deactivated→Deleted action; `PROD-526`은 이 action을 구현하지 않고 관계 cleanup만 통합)

## Capabilities

### New Capabilities

- `profile-tag`: canonical Hashtag identity, Profile Tag 목록 검증·순서·권한·원자적 교체·visibility·생명주기 계약
- `profile-tag-ui`: Profile Tag 편집과 공개 표시의 플랫폼 공통 상태·상호작용·접근성 계약

### Modified Capabilities

- `data-model`: canonical Hashtag identity를 저장하고 Profile과의 순서 있는 관계, 유일성, 삭제 생명주기와 migration 계약을 추가한다.
- `profile`: 공개 Profile object가 정규화된 Tag 목록을 제공하고 Local Profile Owner의 기존 update가 전체 목록을 원자적으로 교체하도록 확장한다.
- `web-app-shell`: 기존 Profile 기본 정보 표시가 bio 다음에 저장 순서의 비대화형 TagChip 목록을 포함하도록 확장한다.

## Impact

- Core/DB: canonical Hashtag identity 정규화·저장 경계, Profile-Hashtag 순서 관계, migration, transaction과 `PROD-532` lifecycle 경계의 관계 cleanup 통합
- GraphQL/Core service: Profile Tag 공개 field, Profile update input·payload·권한·validation·원자성
- Universal client: 기존 Profile 편집 form과 공개 Profile header, Relay fragment·mutation cache, TagChip과 상태 카탈로그
- Verification: DB 제약·migration, 서비스·GraphQL 통합, Web·Android·iOS component·접근성·Relay 회귀, 부모 `PROD-522` 종단 간 검증
- Dependency: `PROD-526`은 선행 `PROD-532`의 terminal lifecycle action에 의존하고, `PROD-527`은 `PROD-491`의 controlled editor, `PROD-526`의 API 기반과 기존 Profile 수정 흐름 `PROD-492`에 의존한다.
- Excluded systems: `PROD-525`의 Profile Tag 검색, 검색 query·정렬·pagination·navigation, Hashtag Post List, Followed Hashtag, Remote Profile Tag와 ActivityPub
