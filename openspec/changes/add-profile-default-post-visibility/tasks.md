## 1. PROD-648 Canonical·저장 계약

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/reply-composer.md`
- `PROD-648`

**Deliverable**

Local Profile별 기본 Post Visibility를 durable하게 저장하고 기존·미설정 Profile을 `UNLISTED`로 읽을 수 있다.

**Guardrails**

- 지원 값은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`뿐이다.
- Remote Profile에 Kosmo Local 설정을 만들지 않고 기존 Post visibility를 rewrite하지 않는다.
- schema 변경은 additive이며 rollback에서 저장된 사용자 값을 임의로 삭제하지 않는다.

**Verification**

- migration strict validation과 schema check를 통과한다.
- 기존/신규 Local Profile과 Remote Profile의 저장·fallback·지원하지 않는 값 거부를 core test로 검증한다.

- [x] 1.1 Profile 기본 Post Visibility와 Reply Composer 초기값의 canonical 문서를 PROD-648 계약에 맞게 정렬한다.
- [ ] 1.2 Local Profile 기본값을 저장할 additive schema와 migration을 구현한다.
- [ ] 1.3 Profile 생성·조회·Owner update에서 Local fallback, 허용 값과 Remote 비저장 계약을 구현한다.
- [ ] 1.4 기존/신규 Local Profile, Remote Profile, `DIRECT` 거부와 부분 update 원자성을 검증한다.

## 2. PROD-648 GraphQL·권한 계약

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- `PROD-648`

**Deliverable**

Profile Member는 Local Profile 기본값을 조회하고 Owner는 변경할 수 있으며 Relay가 갱신된 Profile record로
수렴한다.

**Guardrails**

- Member 조회와 Owner 변경 권한을 구분한다.
- non-member와 Remote Profile에는 값을 노출하거나 설정 변경을 허용하지 않는다.
- 기존 `updateProfile` caller와 Post `visibility` 입력 계약을 깨뜨리지 않는다.

**Verification**

- Owner·Member·non-member·Remote의 field 조회와 mutation 성공/거부를 GraphQL integration test로 검증한다.
- `DIRECT`와 명시적 `null` 거부, omitted input의 변경 없음, payload Profile 값을 검증한다.
- GraphQL schema generation/check와 API typecheck를 통과한다.

- [ ] 2.1 membership을 검증하는 nullable Profile 기본값 field와 optional Owner update input/payload 계약을 구현한다.
- [ ] 2.2 Owner·Member·non-member·Remote와 허용/거부 값의 GraphQL integration test를 추가한다.
- [ ] 2.3 schema 산출물과 generated Relay types를 갱신하고 API·client 계약 check를 통과시킨다.

## 3. PROD-648 Composer 기본값·문맥 격리

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/reply-composer.md`
- `PROD-648`

**Deliverable**

새 일반 Post와 Reply Composer가 selected Profile의 기본값으로 시작하고, fallback·개별 변경·새 문맥을 다른
Profile의 값과 섞지 않는다. 향후 Quote Composer도 같은 공용 Profile fragment 계약을 소비할 수 있다.

**Guardrails**

- 열린 draft를 Relay 설정 변경으로 자동 덮어쓰지 않고 Composer 변경을 Profile 설정으로 자동 저장하지 않는다.
- Parent·Source visibility를 상속하지 않고 Repost 파생 계약과 `DIRECT` 제외를 유지한다.
- 현재 없는 Quote 작성 기능을 이 task에서 새로 구현하거나 완료했다고 주장하지 않는다.

**Verification**

- `PUBLIC`, `UNLISTED`, `FOLLOWERS` seed와 nullable/error fallback을 검증한다.
- 일반 Post·Reply의 개별 변경, 제출 성공 reset, Profile·Parent·Environment 전환과 늦은 completion을 unit 및
  Storybook interaction으로 검증한다.

- [ ] 3.1 공용 Composer Profile fragment와 초기/reset state가 Profile 기본값 또는 `UNLISTED` fallback을 사용하게 한다.
- [ ] 3.2 열린 draft 독립성, 개별 변경 비저장과 기존 Profile·Parent·Environment 문맥 격리를 유지한다.
- [ ] 3.3 일반 Post·Reply Composer의 seed·fallback·reset·전환 회귀 검증을 추가한다.

## 4. PROD-648 Profile 설정 control

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/design/accessibility.md`
- `PROD-648`
- route·page shell 통합 경계: `PROD-653`

**Deliverable**

현재 대상 Local Profile의 기본 Post Visibility를 Owner가 확인·변경·저장·재시도할 수 있는 독립 Profile 설정
component를 제공한다.

**Guardrails**

- 현재 Profile identity와 Kosmo 내부 Profile 설정이라는 소유 경계를 접근성 이름에 포함한다.
- dirty·pending·success·error 상태를 Profile identity별로 격리하고 저장 중 중복 제출을 막는다.
- `/settings` route·navigation·Account 외부 진입점을 복제하지 않고 PROD-653이 component 통합을 소유한다.

**Verification**

- 세 옵션과 설명, target identity, dirty·save·success·failure·retry, Owner가 아닌 상태를 검증한다.
- Profile·Relay Environment 전환 중 늦은 mutation completion 격리를 Storybook interaction과 component test로
  검증한다.
- Web keyboard/screen reader semantics와 Native-compatible label/state를 확인한다.

- [ ] 4.1 현재 Profile identity, 세 옵션과 접근성 이름을 가진 독립 설정 control을 구현한다.
- [ ] 4.2 dirty·pending·success·error·retry와 Relay normalized update, 늦은 completion 격리를 구현한다.
- [ ] 4.3 Owner/Member 상태와 설정 interaction·접근성 회귀 검증을 추가한다.

## 5. PROD-648 통합 검증·handoff

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/reply-composer.md`
- `PROD-648`
- 페이지 통합 책임: `PROD-653`

**Deliverable**

PROD-648이 소유한 DB·GraphQL·Relay·Composer·설정 component slice가 검증되고, PROD-653이 canonical
`/settings`에 통합할 근거와 남은 runtime 위험이 명확하다.

**Guardrails**

- PR readiness와 전체 OpenSpec archive를 분리한다.
- PROD-653 페이지 통합과 Android·iOS 실제 runtime 결과가 없으면 완료했다고 주장하지 않는다.

**Verification**

- OpenSpec strict validation, migration validation, core/API/client focused test와 관련 typecheck를 통과한다.
- 미실행 Web·Android·iOS runtime, Quote surface와 PROD-653 integration을 handoff risk로 기록한다.

- [ ] 5.1 OpenSpec strict validation과 영향 package의 required check를 실행하고 실패를 수정한다.
- [ ] 5.2 실제 implementation diff와 task checkbox가 일치하는지 확인한다.
- [ ] 5.3 PROD-653 통합 지점, 실행 결과, 남은 Quote·platform 검증 위험을 implementation handoff에 기록한다.
