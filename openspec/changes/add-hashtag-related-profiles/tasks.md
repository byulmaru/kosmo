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

로그인한 Account가 기존 Hashtag global identity에서 그 Hashtag를 Profile Tag로 사용하는 공개 Active·Normal Local Profile을 중복 없이 최대 20개씩 cursor pagination으로 조회할 수 있다.

**Guardrails**

- GraphQL 공개 계약은 `Hashtag.relatedProfiles(first:, after:): ProfileConnection!`이며 기존 Hashtag·Profile Node와 `ProfileConnection` identity를 재사용한다.
- Account `login`은 resolver와 관련 Profile 후보 query보다 먼저 평가하고 selected Profile을 요구하지 않는다.
- parent Hashtag identity exact relation, Active·Normal visibility와 Local Instance 조건을 page limit 전에 적용한다.
- `Profile.id ASC` opaque cursor와 field별 기본·최대 20개 상한을 사용하고 relation row 순서·관련도·알파벳순을 도입하지 않는다.
- Hashtag 이름·`#` 접두사를 검색 입력으로 해석하지 않으며 Remote lookup·refresh·materialization을 수행하지 않는다.
- 기존 `searchProfiles`, `profileByHandle`, DB schema·migration·dependency와 PROD-529 client/navigation 범위를 변경하지 않는다.

**Verification**

- API integration test에서 인증 없음·유효하지 않은 Session의 `PERMISSION_DENIED`와 후보 query 미실행, selected Profile 없는 로그인 성공을 검증한다.
- exact/other Hashtag, 빈 결과, Active·Normal Local 포함, 비공개·suspended·Remote 제외와 filter-before-limit page fullness를 검증한다.
- `first` 생략·20 초과 요청, 두 page `after`, `Profile.id ASC`, 중복·누락 없음과 관계 row 순서 비의존을 검증한다.
- 기존 `searchProfiles`와 공개 Profile lookup 회귀를 유지한다.
- `pnpm --filter @kosmo/api test:integration`
- `pnpm --filter @kosmo/api test:unit`
- `pnpm --filter @kosmo/api lint:tsc`
- `pnpm --filter @kosmo/api lint:schema`
- 관련 TypeScript·GraphQL·OpenSpec artifact Prettier와 ESLint, `git diff --check`
- `openspec validate add-hashtag-related-profiles --strict`

- [ ] 1.1 승인된 Hashtag object field와 Account login 선행 경계를 추가하고 forward connection argument와 기존 Profile connection identity를 공개 schema에 맞춘다.
- [ ] 1.2 exact Hashtag 관계, Active·Normal Local visibility, `Profile.id ASC` cursor와 기본·최대 20개 상한을 candidate query와 page limit에 함께 적용한다.
- [ ] 1.3 runtime GraphQL schema와 committed schema를 동기화하고 Hashtag 이름 input·신규 결과 type·기존 검색 shape 변경이 없음을 확인한다.
- [ ] 1.4 인증 실패·selected Profile 없는 성공·exact/empty relation·visibility·Local/Remote·filter-before-limit 경계를 API integration test로 검증한다.
- [ ] 1.5 default/max 20, multi-page cursor 중복·누락 방지, relation row 순서 비의존과 기존 `searchProfiles`·공개 lookup 회귀를 검증한다.
- [ ] 1.6 관련 API typecheck·unit·integration·schema·lint와 strict OpenSpec validation을 완료하고 PROD-528 구현 handoff에 실제 결과와 남은 위험을 기록한다.
