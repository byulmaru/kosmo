## 1. PROD-526 프로필 태그 저장·수정·조회 기반

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `PROD-523` (PR #394)
- `PROD-522`
- `PROD-526`

**Dependency**

- `PROD-532` — Local Profile의 terminal Deactivated→Deleted action을 선행 구현하며, `PROD-526`은 해당 lifecycle 경계에 Profile Tag 관계 cleanup만 통합한다.

**Deliverable**

Local Profile Owner가 승인된 Profile Tag 목록을 다른 Profile 값과 원자적으로 저장하고, 공개 조회 가능한 Local Profile이 정규화된 Tag를 저장 순서로 제공하는 DB·service·GraphQL 기반을 전달한다.

**Guardrails**

- Post와 Profile이 공유하는 canonical Hashtag identity를 사용하고, `PROD-526`에서 그 저장 구조와 관계를 추가하며 별도 ProfileTag identity나 bio/Post 본문 파생을 추가하지 않는다.
- trim·선택적 앞 `#`·NFKC·locale 비종속 Unicode full case folding 뒤 1~20 code point의 Letter·Number·밑줄만 허용한다.
- Profile당 최대 5개, normalized duplicate 거부, 입력 순서와 전체 목록 replacement를 보장한다.
- optional `tags`의 배열·빈 배열·생략/`null` 의미와 `Profile.tags: [String!]!` 공개 계약을 유지한다.
- Active Account의 Owner만 Origin이 Local이고 Lifecycle State가 `Deleted`가 아니며 Suspension State가 `Normal`인 Profile(Deactivated Profile 포함)을 변경하고 scalar 값과 Tag 관계를 직렬화된 한 transaction으로 적용한다. Member·비-Owner·inactive Account, Remote Profile, Deleted Profile, Suspended Profile은 거부한다.
- Deactivated Profile과 Suspended Profile의 관계 보존은 공개 visibility에서 숨기는 정책과 분리한다. 선행 `PROD-532`가 제공하는 Deactivated→Deleted lifecycle transaction 경계에 `profile_hashtag` 관계 cleanup을 통합하며, terminal action이나 상태 전이는 이 task에서 구현하지 않는다. Profile row 물리 삭제의 FK cascade는 별도 DB safety invariant/test로 검증한다. Remote Profile은 빈 tags를 반환하며 actor fetch를 수행하지 않는다.
- migration은 additive하고 기존 bio·Post data를 backfill하지 않는다. 검색 API·reverse lookup·검색 index와 Post Hashtag 관계를 추가하지 않는다.

**Verification**

- normalization의 Unicode·길이·허용 문자·duplicate vector를 core unit test로 검증한다.
- fresh/upgrade migration, unique/check/foreign-key, 빈 기존 Profile, Deactivated/Suspended 관계 보존과 물리 Profile row 삭제 FK cascade safety를 `@kosmo/core` migration·DB test로 검증한다. 이 검증은 `PROD-532` terminal action의 동작을 대체하지 않는다.
- Active Account Owner의 Local Profile(Deactivated 포함) 성공과 Member·비-Owner·inactive Account·Remote·Deleted·Suspended 거부, omitted·null·empty·ordered tags, rollback과 concurrent replacement를 service·GraphQL database integration test로 검증한다. `PROD-532`가 완료된 뒤 제공된 Deleted lifecycle 경계에서 `profile_hashtag` 관계만 제거하고 canonical Hashtag row와 다른 Profile/Post 관계를 보존하는 cleanup integration을 별도로 검증한다.
- schema snapshot, Profile Origin/연결 Instance Kind가 Local인 모든 Profile의 저장 순서 batch 조회·Remote 빈 목록·query count를 API test로 검증하고 `pnpm --filter @kosmo/core test`, `pnpm --filter @kosmo/api test`, schema·type check를 통과시킨다.

- [ ] 1.1 승인된 Unicode normalization과 Profile Tag 목록 validation을 구현하고 경계·동등성·중복 unit test를 추가한다.
- [ ] 1.2 canonical Hashtag identity와 순서 있는 Profile 관계의 additive schema·migration을 구현하고 fresh/upgrade·제약 test를 추가한다. 물리 Profile row 삭제 FK cascade는 `PROD-532` terminal action 및 lifecycle cleanup과 별도로 검증한다.
- [ ] 1.3 Active Account Owner·Local·editable 조건(Lifecycle != `Deleted`, Suspension `Normal`)을 검증하면서 Profile 값과 전체 Tag 목록을 원자적으로 교체하는 service 동작을 구현하고 성공·Deactivated 허용·Deleted/Suspended/Remote/non-Owner/inactive Account 거부·rollback·동시성 DB test를 추가한다.
- [ ] 1.4 **선행 `PROD-532` 완료 후** 해당 이슈가 제공하는 Deactivated→Deleted lifecycle transaction 경계에 `profile_hashtag` 관계 cleanup을 통합한다. terminal action·상태 전이는 구현하지 않으며, cleanup이 삭제된 Profile의 관계만 제거하고 canonical Hashtag row·다른 Profile/Post 관계는 보존하는 integration test를 추가한다. 물리 FK cascade safety는 별도 DB test로 검증한다.
- [ ] 1.5 GraphQL `Profile.tags`와 optional update input·payload를 구현하고 Profile Origin/연결 Instance Kind가 Local인 모든 Profile의 저장 순서 batch 조회, Remote 빈 목록, 입력 의미와 기존 update 호환성 integration test를 추가한다.
- [ ] 1.6 `@kosmo/core`·`@kosmo/api` 필수 검증과 schema 동기화를 통과시키고 `PROD-526` PR에 migration·권한·transaction·query-count 및 `PROD-532` dependency/cleanup integration 증거를 기록한다.

## 2. PROD-527 프로필 수정·공개 화면 연결

**Authority / Provenance**

- `docs/design/profile-tags.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `PROD-523` (PR #394)
- `PROD-522`
- `PROD-492`
- `PROD-527`

**Deliverable**

Local Profile Owner가 기존 Profile 편집 화면에서 Profile Tag를 추가·제거·순서 변경하고 저장 실패에서 복구할 수 있으며, 공개 Local Profile이 같은 목록을 Web·Android·iOS에서 bio 다음에 일관되게 표시한다.

**Guardrails**

- `PROD-492`가 제공하는 기존 Profile edit form·저장 action을 확장하며 별도 route나 중복 저장 흐름을 만들지 않는다.
- chip은 normalized name 앞에 `#`를 한 번만 표시하고, 추가는 끝에 배치하며 제거 뒤 상대 순서를 유지한다.
- 최대 5개·문자·길이·normalized duplicate를 입력 가까이에 안내하되 server validation을 권위로 유지한다.
- Profile 저장 중 중복 제출을 막고 실패 뒤 Tag 순서와 다른 draft를 보존하며, 성공 뒤 payload의 tags로 Relay Profile record를 동기화한다.
- 순서 변경은 drag 없이도 키보드·스크린리더로 가능해야 하고 제거·이동 action은 최소 44×44 target과 명확한 accessibility label/state를 제공한다.
- 공개 Tag는 bio 다음·통계와 콘텐츠보다 앞에서 wrap하고, 빈 목록은 섹션을 숨기며 검색 전달 전에는 링크·버튼으로 만들지 않는다.
- 기존 theme token·breakpoint와 React Native primitive를 재사용하고 Remote Profile Tag, 검색·자동완성·추천·trend를 추가하지 않는다.

**Verification**

- 기본·추가·제거·순서 변경·5개·invalid·duplicate·pending·server failure·retry와 Relay 성공 상태를 component/Storybook interaction test로 검증한다.
- keyboard·screen-reader 대체 이동, accessibility label/state, 44×44 target, 색 외 상태 표현과 좁은 화면 wrapping을 접근성·layout test로 확인한다.
- 빈/최대/긴 Local tags와 Remote 빈 tags를 Web·Android·iOS 공용 상태 카탈로그에서 검증한다.
- Owner 편집 저장부터 공개 Profile 재조회·표시까지 Web E2E를 검증하고 `pnpm --filter @kosmo/app test`, `pnpm --filter @kosmo/web test`의 관련 suite를 통과시킨다.

- [ ] 2.1 `PROD-492` Profile edit form에 현재 tags를 초기화하고 추가·제거·명시적 순서 변경을 제공하는 controlled editor를 연결한다.
- [ ] 2.2 최대 개수·normalization 미리보기·문자·길이·duplicate validation과 keyboard/screen-reader·touch 접근성 상태를 구현하고 component interaction test를 추가한다.
- [ ] 2.3 기존 Profile mutation에 전체 Tag draft를 포함하고 pending·server field error·retry·성공 Relay record 동기화를 구현해 상태 전이를 검증한다.
- [ ] 2.4 공개 Profile의 bio 다음에 저장 순서의 비대화형 wrapping TagChip 목록을 연결하고 빈·최대·긴·Remote 상태 test를 추가한다.
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

**Dependency**

- `PROD-532`의 terminal Deactivated→Deleted action과 필수 검증이 먼저 완료되어야 lifecycle cleanup 통합과 부모 종단 간 검증을 시작할 수 있다.

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

- [ ] 3.1 `PROD-532` terminal action의 완료·필수 검증과 `PROD-526`·`PROD-527`의 완료 조건, PR, 필수 test와 unresolved review thread가 모두 정리되었는지 확인한다.
- [ ] 3.2 backend와 universal client 결과를 통합해 Owner 성공·Deactivated 편집·Deleted/Suspended/Remote/non-Owner/inactive Account 거부·validation 실패·rollback·draft retry·공개 순서·Active+Normal visibility 종단 간 시나리오를 검증한다. `PROD-532`가 제공한 terminal lifecycle 경계에서의 Profile Tag 관계 cleanup과 물리 Profile row 삭제 FK cascade safety는 terminal action 자체의 검증과 서로 별도 통합·DB 검증으로 확인한다.
- [ ] 3.3 기존 Profile update·공개/Remote 조회 회귀와 검색·navigation·ActivityPub 제외 범위를 확인하고 부모 `PROD-522`에 통합 증거를 기록한다.
- [ ] 3.4 구현과 canonical·Linear·OpenSpec 정합성을 재검토하고 필요한 upstream 승인·delta 수정 뒤 strict validation을 통과시킨다.
- [ ] 3.5 모든 task와 통합 gate가 완료된 뒤 `add-profile-tags`를 archive하고 archive 후 validation·Linear 완료 상태를 확인한다.
