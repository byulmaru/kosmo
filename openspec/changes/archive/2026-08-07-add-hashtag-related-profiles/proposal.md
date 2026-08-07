## Why

공개 Profile의 TagChip은 정확한 Hashtag identity를 제공하고, PROD-528이 그 Hashtag를 Profile Tag로 사용하는 공개 Profile을 역조회하는 API를 제공했다. 그러나 TagChip에서 관계 목록으로 이동하는 client route와 Relay 목록 상태가 없어 사용자는 아직 이 탐색 흐름을 이용할 수 없다. 기존 사람 검색과 분리된 exact identity 탐색을 Web·Android·iOS 공용 화면에 연결한다.

## What Changes

- 기존 `Hashtag` Node에 로그인한 Account만 사용할 수 있는 `relatedProfiles(first:, after:): ProfileConnection!` 관계 목록을 추가한다.
- 결과를 정확한 Hashtag identity와 관계된 공개 Active·Normal Profile로 제한하고, visibility를 페이지 상한 전에 적용한다.
- 결과를 immutable `Profile.id ASC` cursor로 정렬하고 한 요청의 기본·최대 크기를 20개로 제한한다.
- 인증 실패, 존재하지만 관계가 없는 Hashtag, visibility, 저장된 관계와 원격 조회 경계, cursor 페이지의 중복·누락과 기존 `searchProfiles` 회귀를 API 통합 테스트로 검증한다.
- 공개 Profile의 TagChip과 직접 진입이 `/hashtags/[hashtagId]/profiles`에서 같은 Hashtag Node의 관계 목록을 열게 하고, 화면 제목을 `#<태그명> 관련 프로필`로 표시한다.
- 기존 표시 전용 TagChip과 Profile 목록 item을 재사용하면서 navigation 입력 target, 전용 Relay connection, loading/error/retry/empty/next-page/terminal 상태를 제공한다.
- PROD-528 API slice와 PROD-529 client/navigation slice는 각자의 구현·검증을 소유하고, PROD-525가 전체 흐름의 통합 검증과 OpenSpec archive를 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`
- Linear Contract: `PROD-525`
- Linear Implementations: `PROD-528` (완료된 API slice), `PROD-529` (현재 client/navigation slice)

## Capabilities

### New Capabilities

- `hashtag-related-profile-api`: 정확한 Hashtag identity에서 공개 Profile 관계를 인증·visibility·비용 제한 cursor 계약으로 조회하는 GraphQL API
- `hashtag-related-profile-navigation`: 공개 Profile TagChip과 직접 route에서 exact Hashtag identity의 관련 Profile 목록을 공용 client 상태로 탐색하는 navigation

### Modified Capabilities

없음.

## Impact

- 기존 배포 기반: PROD-528의 `Hashtag.relatedProfiles`, `ProfileConnection`, API resolver와 `Hashtags`·`ProfileHashtags`·`Profiles`·`Instances` data access 재사용
- App route: `/hashtags/[hashtagId]/profiles`와 Hashtag Node 기반 Relay query·전용 connection
- App UI: 공개 Profile TagChip navigation, 공용 PageHeader와 기존 Profile 목록 item·pagination 상태 재사용
- Verification: API schema/integration test, App unit·상태 catalog, Web E2E와 React Native source mapping
- PROD-529 slice에서 변경 없음: DB schema·migration·dependency, API schema/resolver, `searchProfiles`, Remote lookup/materialization과 analytics
