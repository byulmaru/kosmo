## 1. PROD-526 프로필 태그 저장·수정·조회 기반

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `PROD-523` (PR #394)
- `PROD-522`
- `PROD-526`

**Deliverable**

Local Profile Owner가 승인된 Profile Tag 목록을 다른 Profile 값과 원자적으로 저장하고, 공개 조회 가능한 Local Profile이 연결된 normalized Tag를 제공하는 DB·service·GraphQL 기반을 전달한다. 관계와 API 배열의 순서는 계약하지 않는다.

**Guardrails**

- Post와 Profile이 공유하는 canonical Hashtag identity를 사용하고, `PROD-526`에서 그 저장 구조와 관계를 추가하며 별도 ProfileTag identity나 bio/Post 본문 파생을 추가하지 않는다.
- Hashtag가 trim·선택적 앞 `#`·NFKC·locale 비종속 Unicode full case folding, 1~20 code point의 Letter·Number·밑줄 Name syntax와 normalized-name uniqueness를 소유한다.
- Profile 관계는 입력을 Hashtag identity로 resolve/create하고 같은 canonical identity의 duplicate를 거부하며 전체 목록 replacement를 보장한다. 제품상 max count·관계 position·저장/노출 순서는 없다.
- optional `tags`의 배열·빈 배열·생략/`null` 의미와 `Profile.tags: [String!]!` 공개 계약을 유지한다.
- Active Account의 Owner만 Origin이 Local이고 Lifecycle State가 `Deleted`가 아니며 Suspension State가 `Normal`인 Profile(Deactivated Profile 포함)을 변경하고 scalar 값과 Tag 관계를 직렬화된 한 transaction으로 적용한다. Member·비-Owner·inactive Account, Remote Profile, Deleted Profile, Suspended Profile은 거부한다.
- Deactivated·Suspended·Deleted 상태 전이에서 관계를 보존하는 정책은 공개 visibility에서 숨기는 정책과 분리한다. 별도 canonical 보존·파기 정책이 없는 상태 기반 cleanup을 추가하지 않는다. Profile row 물리 삭제의 FK cascade는 별도 DB safety invariant/test로 검증한다. Remote Profile은 빈 tags를 반환하며 actor fetch를 수행하지 않는다.
- migration은 additive하고 기존 bio·Post data를 backfill하지 않는다. 검색 API·reverse lookup·검색 index와 Post Hashtag 관계를 추가하지 않는다.

**Verification**

- Hashtag가 소유한 normalization의 Unicode·길이·허용 문자·normalized-name uniqueness vector와 Profile 관계의 canonical identity duplicate vector를 core unit test로 검증한다.
- fresh/upgrade migration, Hashtag Name 및 `(profile_id, hashtag_id)` unique/foreign-key 제약, position column·position unique/check·제품 max count가 없음을 확인하고, 빈 기존 Profile, Deactivated/Suspended/Deleted 관계 보존과 물리 Profile row 삭제 FK cascade safety를 `@kosmo/core` migration·DB test로 검증한다.
- Active Account Owner의 Local Profile(Deactivated 포함) 성공과 Member·비-Owner·inactive Account·Remote·Deleted·Suspended 거부, omitted·null·empty·임의 개수 tags, canonical identity duplicate, rollback과 concurrent replacement를 service·GraphQL database integration test로 검증한다. 관계 저장·조회와 API 배열의 순서를 가정하지 않는 테스트를 포함한다.
- schema snapshot, Profile Origin/연결 Instance Kind가 Local인 모든 Profile의 관계 batch 조회·Remote 빈 목록·query count와 `Profile.tags: [String!]!` 배열 순서 비보장 계약을 API test로 검증하고 `pnpm --filter @kosmo/core test`, `pnpm --filter @kosmo/api test`, schema·type check를 통과시킨다.

- [ ] 1.1 Hashtag-owned Name normalization·syntax·length·normalized-name uniqueness와 Profile Tag 목록의 canonical identity duplicate validation을 구현하고 경계·동등성·중복 unit test를 추가한다.
- [ ] 1.2 canonical Hashtag identity와 `(profile_id, hashtag_id)` Profile 관계의 additive schema·migration을 구현하고 position column·position unique/check·제품 max count 없이 fresh/upgrade·제약 test를 추가한다. 상태 전이 관계 보존과 물리 Profile row 삭제 FK cascade를 각각 검증한다.
- [ ] 1.3 Active Account Owner·Local·editable 조건(Lifecycle != `Deleted`, Suspension `Normal`)을 검증하면서 Profile 값과 전체 Tag 목록을 원자적으로 교체하는 service 동작을 구현하고 성공·Deactivated 허용·Deleted/Suspended/Remote/non-Owner/inactive Account 거부·canonical identity duplicate·rollback·동시성 DB test를 추가한다. 관계나 반환 배열 순서를 의미 있는 결과로 가정하지 않는다.
- [ ] 1.4 GraphQL `Profile.tags`와 optional update input·payload를 구현하고 Profile Origin/연결 Instance Kind가 Local인 모든 Profile의 관계 batch 조회, Remote 빈 목록, 배열 순서 비보장, 입력 의미와 기존 update 호환성 integration test를 추가한다.
- [ ] 1.5 `@kosmo/core`·`@kosmo/api` 필수 검증과 schema 동기화를 통과시키고 `PROD-526` PR에 migration·권한·transaction·query-count 및 상태별 관계 보존 증거를 기록한다.

## 2. PROD-527 프로필 수정·공개 화면 연결

**Authority / Provenance**

- `docs/design/profile-tags.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `PROD-523` (PR #394)
- `PROD-522`
- `PROD-491`
- `PROD-492`
- `PROD-527`

**Deliverable**

`PROD-491`의 controlled Profile Tag editor를 기존 Profile edit route·저장 action에 연결해 Local Profile Owner가 저장 실패에서 복구할 수 있으며, 공개 Local Profile이 같은 목록을 Web·Android·iOS에서 bio 다음에 일관되게 표시한다.

**Guardrails**

- `PROD-491`의 controlled editor·client validation과 `PROD-492`의 route·저장 action을 재사용하며 editor, route나 저장 흐름을 중복 구현하지 않는다. 순서 변경 control은 추가하지 않는다.
- chip은 normalized name 앞에 `#`를 한 번만 표시하고, 추가·제거를 지원한다. 개수·관계 position·저장/표시 순서를 UI 계약으로 만들지 않는다.
- `PROD-491`이 제공한 Hashtag Name syntax·문자·길이·canonical identity duplicate client validation을 재사용하고 server Hashtag validation을 권위로 유지한다. 제품 max count validation은 추가하지 않는다.
- Profile 저장 중 중복 제출을 막고 실패 뒤 현재 Tag draft와 다른 draft를 보존하며, 성공 뒤 payload의 tags로 Relay Profile record를 동기화한다. 배열 순서는 계약으로 해석하지 않는다.
- 제거 action은 compact `32×32` 시각 크기를 유지하되 실제 target은 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`로 제공하고 명확한 accessibility label/state를 유지한다. 순서 변경 action이나 drag gesture는 제공하지 않는다.
- 공개 Tag는 bio 다음·통계와 콘텐츠보다 앞에서 wrap하고, 빈 목록은 섹션을 숨기며 검색 전달 전에는 링크·버튼으로 만들지 않는다. TagChip 목록의 배열 순서는 계약하지 않는다.
- 기존 theme token·breakpoint와 React Native primitive를 재사용하고 Remote Profile Tag, 검색·자동완성·추천·trend를 추가하지 않는다.

**Verification**

- `PROD-491` editor의 기본·추가·제거·임의 개수·invalid·canonical identity duplicate 상태가 연결 뒤에도 회귀하지 않고 pending·server failure·retry·Relay 성공 상태와 함께 동작하는지 component/Storybook interaction test로 검증한다. 순서 변경·max count 제약이 추가되지 않았는지도 확인한다.
- Hashtag-owned client validation과 server parity를 재사용했는지 확인하고, 공통 `32×32` 시각 크기와 Web `32×32 CSS px`·iOS `44×44 pt`·Android `48×48 dp` 실제 target, accessibility label/state·색 외 상태 표현과 좁은 화면 wrapping을 접근성·layout test로 보강한다. 순서 변경 control이 없음을 검증한다.
- 빈/임의 개수/긴 Local tags와 Remote 빈 tags를 Web·Android·iOS 공용 상태 카탈로그에서 검증한다.
- Owner 편집 저장부터 공개 Profile 재조회·표시까지 Web E2E를 검증하고 `pnpm --filter @kosmo/app test`, `pnpm --filter @kosmo/web test`의 관련 suite를 통과시킨다.

- [ ] 2.1 `PROD-491`의 controlled Profile Tag editor를 재작성하지 않고 `PROD-492` Profile edit route·저장 흐름에 연결해 현재 tags를 초기화한다.
- [ ] 2.2 `PROD-491`의 Hashtag Name normalization 미리보기·문자·길이·canonical identity duplicate validation과 플랫폼별 제거 target을 재사용하고 회귀·server parity를 검증하며, `PROD-527` 연결 뒤 Web `32×32 CSS px`·iOS `44×44 pt`·Android `48×48 dp` runtime 상태를 보강한다. max count·순서 변경 control은 추가하지 않는다.
- [ ] 2.3 기존 Profile mutation에 전체 Tag draft를 포함하고 pending·server field error·retry·성공 Relay record 동기화를 구현해 상태 전이를 검증한다.
- [ ] 2.4 공개 Profile의 bio 다음에 비대화형 wrapping TagChip 목록을 연결하고 빈·임의 개수·긴·Remote 상태와 배열 순서 비보장 test를 추가한다.
- [ ] 2.5 Web·Android·iOS 공용 상태 카탈로그, app 필수 check와 Owner 편집→공개 표시 Web E2E를 통과시키고 `PROD-527` PR에 접근성·layout·Relay 증거를 기록한다.

## 3. PROD-522 통합 검증과 OpenSpec archive

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `docs/design/profile-tags.md`
- `PROD-523` (PR #394)
- `PROD-522`
- `PROD-526`
- `PROD-527`

**Deliverable**

두 구현 slice가 하나의 승인 계약으로 함께 동작함을 종단 간 검증하고, canonical 문서·Linear·구현·OpenSpec이 일치할 때 `add-profile-tags` change를 archive한다.

**Guardrails**

- `PROD-526`과 `PROD-527`의 각 PR·필수 검증이 완료되기 전에는 부모 통합 결과나 OpenSpec change를 완료로 처리하지 않는다.
- PR readiness와 OpenSpec archive를 분리한다. 개별 PR이 준비되어도 전체 scope·task·통합 검증이 끝나기 전에는 archive하지 않는다.
- 검색 없이 Profile Tag 편집·표시가 독립적으로 전달되어야 하며 `PROD-525`의 query·pagination·navigation을 이 change에 섞지 않는다.
- 구현에서 제품 계약 불일치가 발견되면 canonical 문서와 Linear 계약부터 갱신·승인한 뒤 specs와 decisions를 동기화한다.
- archive 전후 strict validation과 delta spec 동기화를 확인한다.

**Verification**

- 두 자식 이슈의 DB·API·app·Web 검증과 PR 상태를 확인하고 부모에 증거를 연결한다.
- Owner 편집→transaction 저장→GraphQL 재조회→Relay 갱신→공개 표시, 실패 rollback·draft 복구와 비활성/Remote 비노출을 통합 환경에서 검증한다.
- 기존 Profile update, Profile 공개 화면과 stored Remote Profile 조회가 회귀하지 않고 검색 link/API가 추가되지 않았음을 확인한다.
- `node_modules/.bin/openspec validate add-profile-tags --strict`를 archive 전 통과시키고 archive 뒤 전체 OpenSpec validation과 canonical delta 반영을 확인한다.

- [ ] 3.1 `PROD-526`·`PROD-527`의 완료 조건, PR, 필수 test와 unresolved review thread가 모두 정리되었는지 확인한다.
- [ ] 3.2 backend와 universal client 결과를 통합해 Owner 성공·Deactivated 편집·Deleted/Suspended/Remote/non-Owner/inactive Account 거부·Hashtag Name validation·canonical identity duplicate·rollback·draft retry·배열 순서 비보장·Active+Normal visibility 종단 간 시나리오를 검증한다. 제품 max count·position·reorder 제약이 없는지도 확인하고, 상태별 관계 보존과 물리 Profile row 삭제 FK cascade safety를 별도 검증한다.
- [ ] 3.3 기존 Profile update·공개/Remote 조회 회귀와 검색·navigation·ActivityPub 제외 범위를 확인하고 부모 `PROD-522`에 통합 증거를 기록한다.
- [ ] 3.4 구현과 canonical·Linear·OpenSpec 정합성을 재검토하고 필요한 upstream 승인·delta 수정 뒤 strict validation을 통과시킨다.
- [ ] 3.5 모든 task와 통합 gate가 완료된 뒤 `add-profile-tags`를 archive하고 archive 후 validation·Linear 완료 상태를 확인한다.
