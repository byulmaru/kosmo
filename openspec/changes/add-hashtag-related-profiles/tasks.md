## 1. PROD-528 Hashtag 관련 Profile 목록 API

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`
- `docs/design/hashtag-related-profiles.md`
- `PROD-523`
- `PROD-524`
- `PROD-525`
- `PROD-528`

**Deliverable**

로그인한 Account가 기존 Hashtag global identity에서 그 Hashtag를 Profile Tag로 사용하는 공개 Active·Normal Profile을 중복 없이 최대 20개씩 cursor pagination으로 조회할 수 있다.

**Guardrails**

- GraphQL 공개 계약은 `Hashtag.relatedProfiles(first:, after:): ProfileConnection!`이며 기존 Hashtag·Profile Node와 `ProfileConnection` identity를 재사용한다.
- Account `login`은 resolver와 관련 Profile 후보 query보다 먼저 평가하고 selected Profile을 요구하지 않는다.
- parent Hashtag identity exact relation과 Active·Normal visibility를 page limit 전에 적용한다.
- `Profile.id ASC` opaque cursor와 field별 기본·최대 20개 상한을 사용하고 relation row 순서·관련도·알파벳순을 도입하지 않는다.
- Hashtag 이름·`#` 접두사를 검색 입력으로 해석하지 않으며 Remote lookup·refresh·materialization을 수행하지 않는다.
- 기존 `searchProfiles`, `profileByHandle`, DB schema·migration·dependency와 PROD-529 client/navigation 범위를 변경하지 않는다.

**Verification**

- API integration test에서 인증 없음·유효하지 않은 Session의 `PERMISSION_DENIED`와 후보 query 미실행, selected Profile 없는 로그인 성공을 검증한다.
- exact/other Hashtag, 빈 결과, Active·Normal Profile 포함, 비공개·suspended 제외와 filter-before-limit page fullness를 검증한다.
- `first` 생략·20 초과 요청, 두 page `after`, `Profile.id ASC`, 중복·누락 없음과 관계 row 순서 비의존을 검증한다.
- 기존 `searchProfiles`와 공개 Profile lookup 회귀를 유지한다.
- `pnpm --filter @kosmo/api test:integration`
- `pnpm --filter @kosmo/api test:unit`
- `pnpm --filter @kosmo/api lint:tsc`
- `pnpm --filter @kosmo/api lint:schema`
- 관련 TypeScript·GraphQL·OpenSpec artifact Prettier와 ESLint, `git diff --check`
- `openspec validate add-hashtag-related-profiles --strict`

- [x] 1.1 승인된 Hashtag object field와 Account login 선행 경계를 추가하고 forward connection argument와 기존 Profile connection identity를 공개 schema에 맞춘다.
- [x] 1.2 exact Hashtag 관계, Active·Normal visibility, `Profile.id ASC` cursor와 기본·최대 20개 상한을 candidate query와 page limit에 함께 적용한다.
- [x] 1.3 runtime GraphQL schema와 committed schema를 동기화하고 Hashtag 이름 input·신규 결과 type·기존 검색 shape 변경이 없음을 확인한다.
- [x] 1.4 인증 실패·selected Profile 없는 성공·exact/empty relation·visibility·원격 조회 미수행·filter-before-limit 경계를 API integration test로 검증한다.
- [x] 1.5 default/max 20, multi-page cursor 중복·누락 방지, relation row 순서 비의존과 기존 `searchProfiles`·공개 lookup 회귀를 검증한다.
- [x] 1.6 관련 API typecheck·unit·integration·schema·lint와 strict OpenSpec validation을 완료하고 PROD-528 구현 handoff에 실제 결과와 남은 위험을 기록한다.

## 2. PROD-529 Hashtag 관련 Profile client navigation

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`
- `docs/design/hashtag-related-profiles.md`
- `docs/design/profile-tags.md`
- `PROD-524`
- `PROD-525`
- `PROD-528`
- `PROD-529` (2026-08-05 route 선택과 제목 승인)

**Deliverable**

로그인한 Account가 공개 Profile의 TagChip 또는 직접 `/hashtags/[hashtagId]/profiles` route에서 정확한 Hashtag identity의 관련 공개 Profile을 `#<태그명> 관련 프로필` 맥락과 기존 Profile 목록 경험으로 탐색할 수 있다.

**Guardrails**

- path의 Hashtag global ID와 기존 `node(id:)`·`Hashtag.relatedProfiles(first:, after:)`를 사용하고 이름·`#` text를 identity나 검색 입력으로 사용하지 않는다.
- 공개 Profile의 표시 전용 TagChip과 편집기의 제거·validation 책임을 유지하고 navigation wrapper만 exact ID route, 접근성 이름과 플랫폼 target을 소유한다.
- Hashtag 전용 Relay connection을 기존 search·followers·following connection과 격리하고 기존 Profile 목록 item·Profile 이동·follow action을 재사용한다.
- 첫 loading/error/retry·empty·다음 page error/retry·terminal 상태에서 선택한 Hashtag 맥락과 이미 표시한 Profile을 보존하며 중복 page 요청을 막는다.
- 기존 `searchProfiles`, Profile Tag 편집·공개 표시 데이터, API·DB·dependency, Remote lookup/materialization과 analytics를 변경하지 않는다.
- Web 자동화와 React Native source mapping을 iOS·Android 실제 runtime 완료 증거로 표현하지 않는다.

**Verification**

- unit test에서 exact ID link, link role, `#<태그명> 관련 프로필 보기` 접근성 이름, 플랫폼 target과 기존 편집 제거 action 비회귀를 검증한다.
- route/list test와 상태 catalog에서 제목, loading, 첫 error/retry, empty, 20개 page, 다음 page error에서 기존 edge 유지·retry, terminal과 중복 요청 방지를 검증한다.
- Web E2E에서 keyboard Tab으로 공개 Profile TagChip link에 focus하고 접근성 이름·role을 확인한 뒤 Enter로 활성화해 승인된 URL·제목·관련 Profile 목록 → 기존 Profile route 이동을 검증한다.
- 기존 사람 검색 입력·결과·pagination 회귀를 유지한다.
- Relay compiler, App TypeScript·unit·Storybook, 관련 Web E2E, ESLint·Prettier, `git diff --check`
- `openspec validate add-hashtag-related-profiles --strict`

- [ ] 2.1 보호된 `/hashtags/[hashtagId]/profiles` route와 Hashtag Node query를 추가하고 canonical 이름의 PageHeader·직접 진입·존재하지 않는 Node 상태를 연결한다.
- [ ] 2.2 공개 Profile TagChip 진입점에 exact ID Link·Pressable, 관계 목록 접근성 이름과 Web·iOS·Android target mapping을 추가하되 표시 chip과 편집 action 책임을 유지한다.
- [ ] 2.3 `Hashtag.relatedProfiles` 전용 Relay pagination fragment와 기존 Profile 목록 item을 연결하고 loading·error·retry·empty·next-page·terminal·중복 요청 상태를 구현한다.
- [ ] 2.4 route와 목록의 최소 unit test·상태 catalog를 추가해 identity, 제목, 상태 보존, Profile action과 검색 connection 격리를 검증한다.
- [ ] 2.5 keyboard focus·접근성 이름·link role·Enter 활성화를 포함한 TagChip→관련 Profile→기존 Profile route Web E2E, 기존 검색 회귀, Relay·TypeScript·App·Storybook·lint·format·strict OpenSpec 검증을 완료하고 Native runtime 미검증을 handoff에 기록한다.

## 3. PROD-525 Hashtag 관련 Profile 탐색 통합과 archive

**Authority / Provenance**

- `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`
- `docs/design/hashtag-related-profiles.md`
- `PROD-525`
- `PROD-528`
- `PROD-529`

**Deliverable**

완료된 API와 client slice가 하나의 exact Hashtag 관계 탐색 흐름으로 정합한지 검증하고, canonical 문서·active spec·구현 증거를 동기화한 뒤 shared change를 archive한다.

**Guardrails**

- PROD-528 API와 PROD-529 client가 각자 소유한 구현·검증을 반복하지 않고 cross-slice identity·auth·visibility·pagination·navigation 연결만 검증한다.
- API 또는 client task 일부의 완료만으로 shared change를 완료·archive하지 않는다.
- Web proof와 Native runtime QA 경계를 유지하고 아직 수행하지 않은 플랫폼 검증을 완료로 기록하지 않는다.

**Verification**

- 공개 Profile TagChip에서 exact Hashtag Node·관련 Profile connection·Profile route까지 종단간 identity와 상태 흐름을 확인한다.
- 최신 canonical·Linear·OpenSpec·API/client 구현과 검증 증거의 정합성을 확인한다.
- archive 전·후 strict OpenSpec validation을 통과한다.

- [ ] 3.1 PROD-528·529 완료 증거를 연결해 exact identity, Account auth, visibility-before-limit, 20개 cursor와 TagChip→관련 Profile→Profile route의 cross-slice 흐름을 검증한다.
- [ ] 3.2 canonical·Linear·delta spec·tasks 정합성을 확인하고 shared change를 archive한 뒤 strict validation을 완료한다.
