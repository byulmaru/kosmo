## 1. PROD-667 Relay·Profile 설정 control

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-667`

**Deliverable**

현재 대상 Local Profile의 기본 Post Visibility를 Owner가 확인·변경하고 실패 시 재시도할 수 있으며 Member는
값을 Composer에서 소비하되 변경할 수 없는 Profile 설정 control을 제공한다. 구체적인 선택·저장 상호작용은
고정하지 않는다.

**Guardrails**

- 설정값과 변경 요청 상태를 Profile·Relay Environment 문맥별로 격리한다.
- mutation payload의 Profile로 normalized Relay record를 수렴시키고 별도 client 전역 설정을 만들지 않는다.
- Byulmaru ID Account entry와 PROD-685 settings route·navigation을 재구현하지 않는다.

**Verification**

- 지원 공개 범위, target identity, Owner/Member, 변경 성공·실패·재시도와 중복 mutation 방지를 component test로
  검증한다.
- Profile·Relay Environment 전환 중 늦은 mutation completion이 새 control 상태를 바꾸지 않는지 검증한다.

- [x] 1.1 현재 Profile identity, 세 옵션과 접근성 이름을 가진 설정 control을 구현한다.
- [x] 1.2 Owner 변경 반영과 Member 비편집, 요청 성공·실패·재시도를 구현한다.
- [x] 1.3 Relay normalized update와 Profile·Environment 전환의 늦은 completion 격리를 구현한다.
- [x] 1.4 Owner/Member와 설정 interaction·접근성 회귀 검증을 추가한다.

## 2. PROD-667 일반 Post·Reply Composer 기본값

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/reply-composer.md`
- `PROD-667`

**Deliverable**

새 일반 Post와 Reply Composer가 selected Profile의 기본값으로 시작하고 fallback·개별 변경·새 문맥을 다른
Profile의 값이나 열린 draft와 섞지 않는다.

**Guardrails**

- 열린 draft를 설정 변경으로 자동 덮어쓰지 않고 Composer 변경을 Profile 설정으로 자동 저장하지 않는다.
- Reply Parent Visibility를 상속하지 않는다.
- Quote Composer, Repost와 `DIRECT` recipient·옵션을 추가하거나 완료했다고 주장하지 않는다.

**Verification**

- `PUBLIC`, `UNLISTED`, `FOLLOWERS` seed와 nullable/error `UNLISTED` fallback을 검증한다.
- 일반 Post·Reply의 개별 변경, 제출 성공 reset, Profile·Parent·Environment 전환과 늦은 completion을 unit 및
  Storybook interaction으로 검증한다.

- [x] 2.1 공유 Composer Profile fragment와 initial/reset state가 Profile 기본값 또는 `UNLISTED` fallback을 사용하게 한다.
- [x] 2.2 열린 draft 독립성, 개별 변경 비저장과 Profile·Parent·Environment 문맥 격리를 유지한다.
- [x] 2.3 일반 Post·Reply Composer의 seed·fallback·reset·전환 회귀 검증을 추가한다.

## 3. PROD-667 canonical settings 연결

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-667`
- production settings host: `PROD-685`
- Byulmaru ID Account entry: `PROD-645`

**Deliverable**

Profile 기본 Post Visibility control이 canonical Settings route family의 Profile detail에서 현재 Local Profile
identity와 함께 동작하며 Account 외부 entry와 Profile 내부 설정의 소유 경계를 유지한다.

**Guardrails**

- generic route·navigation·page shell과 Byulmaru ID Account entry 동작을 PROD-667에서 재구현하지 않는다.
- Profile detail 안에서 현재 identity와 control을 제공하고 query·pending·오류·재시도 상태를 자기 기능
  경계에 유지한다.
- standalone story를 production route 연결 완료 증거로 사용하지 않는다.

**Verification**

- 실제 settings host의 Profile detail에서 selected/no-profile, loading/error와 변경 성공·실패 상태를 확인한다.
- Profile detail의 상태가 shell이나 Account entry의 공통 상태로 재구현되지 않는지 page-level test로 검증한다.

- [x] 3.1 실제 PROD-685 settings host의 Profile detail에 현재 Profile identity와 공개 범위 기능을 연결하되 구체적인 선택·저장 상호작용은 page shell contract로 고정하지 않는다.
- [x] 3.2 selected/no-profile, loading·error·retry와 Profile/Relay actor 전환의 page-level 회귀 검증을 추가한다.

## 4. PROD-667 Frontend 검증·PROD-684 archive handoff

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/reply-composer.md`
- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-667`

**Deliverable**

PROD-667이 소유한 Relay·Profile 설정·Post/Reply Composer·canonical settings 연결이 독립 검증되고 Backend
change와 별개인 Frontend change lifecycle을 완료할 수 있다.

**Guardrails**

- Backend DB/Core/GraphQL 구현과 검증을 반복하거나 Backend change archive를 기다리게 하지 않는다.
- Web 자동화 결과를 Android·iOS runtime 또는 전체 접근성 적합성 증거로 일반화하지 않는다.
- Quote·Repost·DIRECT 제외 범위를 미실행 위험이 아니라 의도된 비범위로 기록한다.

**Verification**

- Relay compiler, app typecheck, focused unit/component test, Storybook interaction·static build·접근성과 OpenSpec
  strict validation을 통과한다.
- 실제 실행한 Web·Android·iOS 범위와 미실행 범위를 분리해 기록한다.

- [x] 4.1 Relay compiler, app typecheck와 focused unit/component test를 통과시킨다.
- [ ] 4.2 Storybook interaction·static build·접근성과 지원 플랫폼 검증을 수행한다. 전체 interaction의 `Posts.stories.tsx > Body Time And Layout States`는 변경 전후 동일한 `naturalWidth=0` fixture 실패로 판정하고 비범위 회귀로 기록한다.
- [ ] 4.3 actual diff와 task checkbox, 최신 canonical·Linear·OpenSpec 정합성을 확인한다.
- [ ] 4.4 `openspec validate connect-profile-default-post-visibility-client --strict`를 통과시키고 PROD-684 archive handoff를 정리한다.
