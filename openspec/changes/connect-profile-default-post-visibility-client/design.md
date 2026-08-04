## Context

Backend PROD-648은 Local Profile Member가 `defaultPostVisibility`를 조회하고 Owner가 기존 `updateProfile`로
변경하는 nullable GraphQL 계약을 제공한다. 현재 `PostComposer`는 일반 Post와 Reply surface가 공유하며
selected Profile·Reply Parent·Relay Environment를 key와 generation guard로 격리하지만 Visibility 초기값은
`UNLISTED`로 고정한다.

PROD-648의 기존 monolith branch에는 Relay fragment, 설정 control과 Composer seed 구현이 이미 있으나
Storybook interaction과 canonical `/settings` 연결은 완료되지 않았다. generic `/settings` route·page shell·
navigation과 Account/Profile 정보 구조는 PROD-653, Byulmaru ID Account entry는 PROD-645가 소유한다. 현재
`main`에는 PROD-653이 정의한 production page/route 구현이 없으므로 PROD-667은 generic shell이나 Account
entry 동작을 복제하지 않고 자신의 Profile child 연결 task를 실제 host가 준비될 때까지 명확히 남겨야 한다.

## Goals / Non-Goals

**Goals:**

- Profile Owner가 기본 Post Visibility를 확인·변경하고 Relay Profile record가 서버 payload로 수렴한다.
- 현재 존재하는 새 일반 Post·Reply Composer가 selected Profile 기본값 또는 `UNLISTED` fallback으로 시작한다.
- 설정 상태와 draft를 Profile·Parent·Environment 문맥별로 격리하고 늦은 completion을 무시한다.
- Profile control을 canonical `/settings`의 Profile child 경계에 연결하고 Frontend 검증과 archive를 소유한다.

**Non-Goals:**

- DB/Core/GraphQL 구현 또는 Backend change archive
- generic `/settings` route·navigation·page shell과 Byulmaru ID Account entry 재구현
- Quote Composer 추가나 Quote 동작 완료 주장
- Repost Visibility, `DIRECT` recipient·옵션 복원 또는 기존 Post Visibility 변경
- Composer 개별 선택과 Profile 설정의 양방향 자동 동기화

## Implementation Guidance

### Current Constraints

- `PostComposer`의 Profile fragment와 local state는 일반 Post와 Reply가 공유한다. Reply 전용 query나 state를
  추가하면 기존 Parent·Environment remount와 upload/mutation generation 경계가 갈라진다.
- Relay Profile record는 여러 화면에서 공유된다. 저장 성공 뒤 별도 client 전역 설정을 유지하면 Composer와
  설정 control이 서로 다른 값을 볼 수 있다.
- 열린 Composer state를 fragment 값과 effect로 계속 동기화하면 사용자의 개별 Visibility 선택을 잃는다.
- 설정 mutation completion은 selected Profile이나 Relay Environment가 바뀐 뒤 도착할 수 있다.
- 현재 `main`에는 production settings page host가 없고 PROD-645 component PR도 독립 review 중이다. standalone
  control을 구현했다고 canonical `/settings` 연결이 완료됐다고 간주할 수 없다.
- Quote 작성 surface는 존재하지 않는다. 공용 Post 계약을 이유로 새 surface를 만들거나 현재 검증 범위를
  확장할 수 없다.

### Recommended Approach

1. 기존 monolith branch의 Frontend 파일만 PROD-667 branch로 옮기고 Backend schema·resolver·migration을
   포함하지 않는다.
2. 설정 control은 현재 Profile fragment와 Owner 여부를 입력으로 받고 세 옵션, target identity와
   dirty·pending·success·error·retry를 한 component/state 경계에서 관리한다. 저장 성공은 mutation payload의
   Profile을 사용해 normalized Relay record에 수렴한다.
3. mutation generation과 Profile/Environment identity를 함께 비교해 이전 문맥의 completion을 무시한다.
   Member 상태에서는 저장 action을 만들거나 mutation을 호출하지 않는다.
4. `PostComposer`의 공유 Profile fragment에서 기본값을 읽고 mount 및 새 문맥의 initial seed로만 사용한다.
   fragment가 `null`이면 `UNLISTED`를 사용하고 mount 뒤 값 변경을 현재 draft에 effect로 복사하지 않는다.
5. 제출 성공 reset은 같은 문맥의 최신 Profile 기본값을 사용한다. selected Profile·Reply Parent·Environment가
   바뀌면 기존 key/generation 경계로 새 draft를 만들고 이전 upload/query/mutation completion을 무시한다.
6. generic settings host가 준비되면 그 Profile child 경계에 control을 연결한다. PROD-645 Account entry의
   label·navigation·오류 상태와 PROD-653 shell의 route·navigation을 재구현하지 않고 page-level test에서 두
   child 상태가 독립적인지만 확인한다.
7. unit/component test로 seed·fallback·draft·late completion을 검증하고 Storybook interaction·static build·
   접근성 및 실제 지원 플랫폼 검증을 Frontend 완료 gate로 둔다.

### Allowed Alternatives

- settings host가 Profile child를 직접 render하거나 명시적인 composition input을 제공하는 두 방식 모두
  허용한다. 어느 방식이든 generic route·navigation과 Account entry 동작을 PROD-667이 소유하지 않고 실제
  canonical `/settings`에서 current Profile identity와 control이 함께 검증돼야 한다.
- Composer fragment가 같은 normalized Profile record를 소비하고 열린 draft 독립성을 유지한다면 fragment
  배치 위치는 기존 component 구조에 맞게 조정할 수 있다.

### Known Traps

- Relay record 변경을 현재 열린 draft에 계속 동기화하지 않는다.
- 다른 Profile의 마지막 설정값을 fallback으로 사용하지 않는다.
- Profile ID 없이 설정 state나 mutation completion을 공유하지 않는다.
- Member에게 disabled save UI만 남기면서 mutation 호출 경로를 유지하지 않는다.
- standalone Storybook story를 production `/settings` 연결 증거로 일반화하지 않는다.
- Quote, Repost 또는 `DIRECT`를 테스트 fixture에 넣어 현재 완료 범위를 넓히지 않는다.

## Risks / Trade-offs

- [settings host가 아직 production code로 존재하지 않아 Profile 연결 task가 늦어질 수 있음] → 기존 client
  구현과 standalone 검증은 병렬로 진행하되 실제 host 연결과 page-level 검증 전에는 task와 change를 완료하지
  않는다.
- [Relay record 갱신이 열린 draft를 덮어쓸 수 있음] → Profile 기본값은 mount/reset seed로만 사용하고
  draft-sync effect를 두지 않는다.
- [Profile 전환 뒤 늦은 mutation이 새 control 상태를 변경할 수 있음] → Profile/Environment identity와
  generation을 completion 시점에 확인한다.
- [Web Storybook 결과를 Native runtime 증거로 과대 해석할 수 있음] → Web 자동화와 Android·iOS 실제 실행
  범위를 분리해 기록한다.

## Migration Plan

1. PROD-648 Backend API가 먼저 배포 가능한 상태가 된다. nullable field이므로 기존 client와 호환된다.
2. PROD-667 Relay fragment, 설정 control과 Post/Reply Composer seed를 배포한다.
3. generic settings host가 준비된 뒤 Profile child를 canonical `/settings`에 연결하고 navigation을 활성화한다.
4. rollback은 PROD-667 client 연결을 되돌리되 Backend nullable field와 저장값은 보존한다.

## Open Questions

없음. settings host의 구체 component API는 PROD-653 구현 경계 안의 비규범적 선택이며, PROD-667은 실제 host가
제공하는 경계에 맞춰 연결하되 제품 행동과 소유권을 변경하지 않는다.
