## Why

공개 Profile의 TagChip은 정확한 Hashtag identity를 이미 제공하지만, 그 Hashtag를 Profile Tag로 사용하는 공개 Profile을 역조회하는 API가 없어 관계 목록 탐색을 시작할 수 없다. PROD-523·524의 Domain Gate와 PROD-526의 Hashtag/Profile Tag 저장 기반이 완료됐으므로, 기존 사람 검색과 분리된 비용 제한 API를 먼저 제공한다.

## What Changes

- 기존 `Hashtag` Node에 로그인한 Account만 사용할 수 있는 `relatedProfiles(first:, after:): ProfileConnection!` 관계 목록을 추가한다.
- 결과를 정확한 Hashtag identity와 관계된 공개 Active·Normal Profile로 제한하고, visibility를 페이지 상한 전에 적용한다.
- 결과를 immutable `Profile.id ASC` cursor로 정렬하고 한 요청의 기본·최대 크기를 20개로 제한한다.
- 인증 실패, 존재하지만 관계가 없는 Hashtag, visibility, 저장된 관계와 원격 조회 경계, cursor 페이지의 중복·누락과 기존 `searchProfiles` 회귀를 API 통합 테스트로 검증한다.
- 이번 PROD-528 slice에서는 client route, TagChip navigation, Relay 목록 상태와 UI를 구현하지 않는다. 해당 범위는 같은 change를 이어받는 PROD-529가 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`
- Linear Contract: `PROD-525`
- Linear Implementations: `PROD-528` (현재 API slice), `PROD-529` (후속 client/navigation slice)

## Capabilities

### New Capabilities

- `hashtag-related-profile-api`: 정확한 Hashtag identity에서 공개 Profile 관계를 인증·visibility·비용 제한 cursor 계약으로 조회하는 GraphQL API

### Modified Capabilities

없음.

## Impact

- GraphQL API: 기존 `Hashtag` Node와 `ProfileConnection`, 생성된 `apps/api/schema.graphql`
- API resolver: `apps/api/src/graphql/resolvers/hashtag/`의 관계 field와 모듈 조립
- Data access: 기존 `Hashtags`, `ProfileHashtags`, `Profiles`, `Instances`와 `profile_hashtag.hashtag_id` index 재사용
- Verification: API schema test와 Profile/Hashtag GraphQL integration test
- 변경 없음: DB schema·migration·dependency, `searchProfiles`, Remote lookup/materialization, Web·Android·iOS client와 analytics
