## Context

현재 client session은 selected Profile id를 제공하고 `Profile.instance.kind`로 Local 여부를 읽을 수 있지만
Membership Role이 Owner인지 확인할 public client contract는 없다. 기존 GraphQL update는 임의 Profile id와 scalar
값을 받고 avatar/header 관계를 지원하지 않는다. `PROD-491`은 presentation을 선제작하고 `PROD-492`는 권한·route·
실제 저장을 연결하며 부모 `PROD-490`이 통합 검증과 archive를 소유한다.

Local Media 완료 결과의 공개 URL과 media type metadata는 `PROD-581`이 소유한다. PROD-492는 해당 구현 위에
쌓여 Profile avatar/header 관계와 viewer-authorized read를 연결하며 Storage Service의 byte 검증·변환·제공
책임을 다시 구현하지 않는다.

Profile Tag는 `add-profile-tags`가 별도 저장·공개 계약을 소유한다. 이 change의 form은 editor presentation만
만들며, `PROD-527`이 같은 component를 연결한다. Follow Approval Policy는 현재 Profile 편집의 controlled draft와
같은 저장 경계에 포함하고, Settings 진입점이 제공되면 `PROD-531`이 제어를 이전한다.

`PROD-613`에서 text-only와 Ready avatar/header ID 저장 모두 DB commit, GraphQL child field resolution,
BFF body 종료, browser JSON parse와 Relay `onCompleted`까지 끝난 뒤 영구 `saving`에 남는 회귀를 재현했다.
같은 correlation에서 navigation guard effect와 `router.replace` callback도 return했지만 실제 Web REPLACE는
발생하지 않았다. 원인은 guard effect가 Expo Router Web의 비동기 navigation commit을 기다리지 않고
`navigationAllowed`를 즉시 `false`로 되돌려 실제 `beforeRemove` 시점에 성공 REPLACE를 다시 차단하는 race다.
해당 한 줄을 제거한 fault injection에서 같은 E2E가 통과해 원인을 입증했다.

## Goals / Non-Goals

**Goals:**

- route·Relay와 분리된 universal Profile edit presentation과 상태 catalog를 제공한다.
- selected Active/Normal Local Profile Owner만 실제 route와 저장을 사용할 수 있게 한다.
- displayName, bio, `followPolicy`와 avatar/header 관계를 검증하고 원자적으로 저장한다.
- 공개 Profile 조회에서 viewer가 볼 수 있는 avatar/header를 `ProfileHero`까지 표시한다.
- guest 공개 Profile 조회를 깨지 않으면서 편집 가능한 selected Owner에게만 entrypoint를 제공한다.
- desktop shell 중앙 600px route와 mobile/native 정보 구조, 접근성을 일관되게 유지한다.
- header 이미지 변경 영역을 hero wrapper와 분리하고 모든 지원 폭에서 `3:1`로 유지한다.
- Profile Tag editor UI를 한 번 만들고 Tag 연결 change가 재사용할 seam을 제공한다.
- 저장 성공 시 제출 draft를 clean baseline으로 확정하고 terminal 상태에서 one-shot REPLACE를 실행한다. clean
  baseline이 유지되는 동안에는 늦은 `beforeRemove`를 허용하되, commit 전 새 draft가 생기면 그 입력 보호를
  우선한다.
- 현재 draft와 Ready avatar/header Media ID를 보존하고 mutation 자동 재전송·이미지 자동 재업로드 없이
  안전하게 확인·수동 재시도하게 한다.

**Non-Goals:**

- Profile Tag storage·GraphQL·Relay·공개 표시
- Settings 전체 정보 구조와 `PROD-531`의 Follow Approval Policy 이전, Profile Link·handle과 Profile lifecycle
- Media upload 인프라, 다른 Profile Media 재사용, crop editor
- orphan Media cleanup, thumbnail·variant, Remote Profile Media, Fedify/ActivityPub projection
- Admin role 제거, client-side Owner 추측과 API 미연결 local persistence
- 근거 없는 이미지 압축·resize, Media Storage Service 성능 개선, 전체 GraphQL 요청에 대한 범용 tracing·
  timeout 정책, Native 실제 기기 QA

## Implementation Guidance

### Current Constraints

- selectedProfileId와 Local origin은 Owner 권한 증거가 아니다. route 진입 전 server-authoritative capability/query가
  필요하다.
- presentation component가 Expo Router나 Relay Environment를 직접 읽으면 Storybook state와 후속 wrapper 재사용이
  어렵다.
- current updateProfile input과 resolver는 임의 Profile id와 scalar 값을 받고 Media 관계를 지원하지 않으므로,
  `followPolicy`를 포함한 selected Profile 저장 경계를 함께 정렬해야 한다.
- avatar/header는 Media upload 결과와 Profile representation 관계를 분리해야 하며 교체·제거가 Media 삭제를
  유발하면 안 된다.
- 현재 avatar/header를 명시적인 `유지` 선택으로 다시 확인하게 하면 단순한 초기값을 불필요한 사용자 action으로
  만들고, 두 field 중 하나만 바꾸는 흐름을 흐린다.
- header 이미지 preview와 avatar·action wrapper를 같은 고정 높이로 취급하면 지원 폭에 따라 preview 비율이
  달라진다.
- Profile Tag API는 `PROD-526` 이후에 도착하므로 `PROD-492` route에서 저장되지 않는 Tag control을 production에
  활성화하면 안 된다.
- 공개 Profile route는 guest도 사용하므로 편집 capability field에 일반 usingProfile auth error를 적용하면 전체
  Profile query를 실패시킬 수 있다.
- 현재 owner-only Media Node loader는 guest와 다른 Account의 Media를 반환하지 않으므로 Profile avatar/header
  공개 표시에 그대로 재사용할 수 없다. Profile 조회 정책을 통과한 관계 resolver가 별도 read authority를 가져야 한다.
- client가 unchanged displayName을 생략하는 것만으로는 legacy 40자 초과 값을 서버에서 안전하게 허용할 수 없다.
  Local edit service가 저장 원문과 입력 원문을 비교해야 하며 Remote materialization의 공용 validation을 좁히면 안 된다.
- 일반 transaction SELECT 뒤 eligibility가 바뀔 수 있지만, action 시작 시 승인된 실행 중 요청을 commit 전에
  취소하는 것은 이 change의 계약이 아니다. 공유 Instance·Account까지 잠그지 않고 이후 요청부터 현재 상태로
  거부한다.
- Web 기본 confirm은 승인된 action label을 제어할 수 없으므로 Web·Native 공통 confirmation presentation이
  필요하다. 성공 replace 전에 dirty guard를 해제하지 않으면 정상 navigation도 막힐 수 있다.
- `PROD-613` 계측에서 `updateProfile` transaction, `relativeHandle`·`avatar`·`header` resolution, API/BFF body,
  browser parse와 Relay `onCompleted`는 모두 종료됐다. API/BFF timeout은 확인된 원인이나 수정 seam이 아니다.
- Web `router.replace`는 실제 route state 반영 전에 return한다. 성공 permission을 action callback return 직후
  회수하면 이후 비동기 `beforeRemove`가 다시 활성화된 guard에 막힌다. 기존 unit mock은 `beforeRemove`를
  `router.replace` 안에서 동기 실행해 이 scheduling 차이를 숨겼다.
- 성공 path는 navigation이 완료될 것을 전제로 `saving`을 명시적으로 끝내지 않으므로 REPLACE가 막히면 편집과
  이탈이 함께 영구 잠긴다.
- post-commit 응답 결과가 불확실한 상태에서 자동으로 같은 mutation을 다시 보내거나 Ready Media ID를 버리면
  사용자가 이미 반영된 저장을 중복 실행하거나 이미 완료한 이미지를 재업로드할 수 있다.

### Recommended Approach

1. `ProfileEditScreen`과 `ProfileEditForm`을 React Native primitive와 theme token으로 만들고 값, validation,
   image state, `followPolicy` enum draft, save state와 callback을 controlled prop으로 받는다. 현재 avatar/header를
   초기 draft로 두고 각 preview의 편집 control이 자기 field만 갱신하게 한다. Switch는 `OPEN`/`APPROVAL_REQUIRED`를
   매핑하고 같은 submit callback에 포함하며, optional submit callback이 없거나 draft가 초기값과 같으면 저장을
   disabled로 둔다.
2. 표시 이름·bio·`followPolicy`와 Profile Tag의 로컬 입력·추가·제거·validation만 presentation 경계에 둔다. Profile Tag
   개수 상한을 두지 않고 순서 변경 mode·control·gesture를 제공하지 않는다. server error와 Relay 연결은
   `PROD-527`이 주입할 수 있게 field-level error와 submit seam을 노출한다.
3. desktop은 shell 중앙 최대 600px surface와 sticky top action을 사용하고 mobile/native는 기존 header·safe area를
   따른다. header 이미지 preview는 hero wrapper와 분리해 `aspectRatio: 3`과 cover crop을 적용한다. 별도 modal
   route나 component-local breakpoint를 만들지 않는다.
4. nullable top-level `selectedProfileForEdit` query는 selected Active/Normal Local Profile의 Owner에게만 Profile을
   반환한다. guest, session/selected Profile 부재와 부적격 Account에는 authorization error 없이 `null`을 반환한다.
   공개 Profile은 이 `id`가 표시 중인 Profile `id`와 같을 때만 편집 button을 렌더한다. 직접 route 진입 실패는
   form 대신 canonical StateView를 표시한다.
5. additive `profile_media` table은 UUIDv7 id, Profile/Media FK, `AVATAR | HEADER` kind, 생성 시각과
   unique(Profile, kind)를 가진다. Profile 삭제는 관계만 cascade하고 Media는 보존한다. Media 조회 index를 두고
   기존 Profile backfill은 하지 않는다.
6. update input의 avatar/header는 omitted=유지, concrete Media global ID=교체, `null`=관계 제거로 해석한다.
   service는 action 시작 시 selected Profile, Owner Membership과 Account eligibility를 일반 SELECT로
   server-authoritative하게 재확인하되 명시적인 lock이나 atomic guard는 사용하지 않는다. 요청된 두 Media가
   모두 같은 selected Profile의 Local Ready인지 먼저 검증한 뒤
   displayName·bio·`followPolicy`와 kind별 relation upsert/delete를 하나의 transaction에서 반영한다. Local edit의
   displayName은 저장 원문과 정확히 같으면 legacy 값을 허용하고 바뀐 값만 Unicode code point 기준 1~40으로
   검증한다. bio는 앞뒤 공백을 제거한 뒤 500자 이하인지 검증한다.
7. `Profile.avatar`와 `Profile.header` resolver는 Profile visibility를 통과한 viewer에게 연결된 Ready Media의
   identity와 `PROD-581`이 저장한 URL을 제공한다. media type persistence를 새 GraphQL field로 노출하지 않고
   일반 Media Node loader의 owner-only 정책도 넓히지 않는다.
   초기 query와 mutation payload가 같은 Media id·표시 field를 선택하게 해 Relay normalization 후 ProfileHero가
   실제 이미지를 표시한다.
8. production route wrapper는 Tag editor와 Tag mutation input을 제외하고 initial Profile draft, picker asset,
   preview URI, field별 upload generation과 Ready Media ID를 소유한다. 현재 이미지가 있으면 변경·삭제·취소 메뉴,
   없으면 picker를 바로 열고, issue→PUT→complete 결과만 draft에 반영한다. stale completion을 무시하고 실패 field의
   `다시 시도`는 그 field만 재업로드한다. Profile 저장 실패 뒤에는 Ready ID를 재사용한다.
9. upload 중·실패 또는 saving 동안 저장/편집 action을 적절히 disabled로 둔다. dirty route/Web back/Android
   hardware back은 공통 confirmation으로 한 번만 가로채고, saving 중 navigation은 차단한다. 성공은 guard 해제,
   Relay normalization, 갱신된 relativeHandle Profile로 `router.replace` 순서이며 toast를 표시하지 않는다.
10. Profile Tag 제거 action은 시각 크기 `32×32`와 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`,
    Android `48×48 dp`를 분리하고 text action은 최소 높이 `36`을 사용한다.
11. `PROD-613` 조사 단계에서만 text-only와 Ready avatar/header ID 저장을 같은 correlation으로 임시 계측했다.
    API transaction·child field·response body, BFF body, browser parse, Relay `onCompleted`, guard effect와
    `router.replace` callback return이 정상 경계이고 최초 실패는 그 뒤 실제 Web route commit임을 확인한 뒤,
    production 계측 코드는 제거했다.
12. 실제 Chromium E2E에서 비동기 navigation ordering을 재현하고, guard의 즉시 permission 회수만 제거한 fault
    injection으로 같은 시나리오가 통과하는지 검증한다. 동기 `beforeRemove` mock만으로 성공 계약을 증명하지 않는다.
13. 성공 저장은 Relay normalization으로 draft를 clean baseline에 맞추고 `saving`을 terminal 상태로 끝낸
    render에서 성공 REPLACE를 one-shot으로 실행한다. clean baseline이 유지되는 동안에는 늦은
    `beforeRemove`를 허용하고, 실제 commit 전 새 draft가 생기면 dirty guard와 discard confirmation으로 그 입력을
    보호한다. navigation no-op/실패에도 draft와 Ready Media ID를 유지하며 mutation 자동 재전송·이미지 자동
    재업로드를 실행하지 않는다.
14. text-only·Ready Media ID 성공, 비동기 `beforeRemove`, navigation no-op/실패, 기존 discard와 transport 실패를
    자동화하고 실제 Web dev에서 재검증한다. API/BFF timeout·buffering은 변경하지 않으며 Native 실제 기기 QA
    미실행과 PROD-490 통합 검증 handoff를 기록한다.

### Allowed Alternatives

- action 시작 시의 eligibility 조회는 동등한 server-authoritative join으로 구성할 수 있다. 이미 승인된 실행 중
  요청을 취소하기 위한 `FOR UPDATE`, shared lock이나 conditional write는 이 change에 추가하지 않는다.
- Profile 관계 resolver는 기존 Media object identity를 반환하거나 같은 Relay identity를 유지하는 좁은 projection을
  사용할 수 있다. 어느 방식이든 일반 Media Node의 owner-only 조회 권한을 공개로 넓히지 않는다.
- desktop sticky action은 shell document scroll을 유지하는 한 route header 또는 중앙 surface 내부 bar로 구현할 수
  있다.
- form은 future modal wrapper에서도 재사용할 수 있지만 현재 production entry는 dedicated route여야 한다.
- 조사 단계의 계측은 기존 Sentry/logging surface의 좁은 timing field나 test-only seam을 사용할 수 있다.
  최종 production에는 correlation logging, 새 tracing dependency나 범용 middleware를 보존하지 않는다.
- 성공 navigation은 저장 결과가 clean baseline으로 확정된 render에서 guard 자체를 비활성화하거나 one-shot
  permission으로 실행할 수 있다. 어느 방식이든 clean baseline이 유지되는 동안 늦은 `beforeRemove`를 막거나,
  새 draft가 생겼는데 discard guard를 비활성 상태로 유지하면 안 된다.

### Known Traps

- `Profile.instance.kind === LOCAL`을 Owner 또는 route 노출 조건으로 사용하지 않는다.
- UI-only slice에 route placeholder, raw GraphQL object cast, 임시 persistence나 성공 navigation을 넣지 않는다.
- `followPolicy` Switch를 별도 즉시 저장하거나 별도 mutation seam으로 분리하지 않는다. 다른 Profile draft와 같은
  저장 callback·실패 복구 경계를 사용하고, Settings 이전은 `PROD-531`에서 수행한다.
- header와 avatar를 묶은 `유지`·`교체`·`제거` action row를 두거나, 한 이미지 편집이 다른 이미지 draft까지
  변경하게 하지 않는다.
- `PROD-527`이 별도 Profile Tag editor를 만들거나 `PROD-492`가 Tag를 저장하지 않으면서 enabled control을 노출하지
  않는다.
- avatar/header 교체·제거 때 Media row/blob을 삭제하거나 다른 Profile Media를 선택하지 않는다.
- `profile_media.media_id` 전체를 unique로 만들어 같은 Ready Media의 avatar/header 동시 사용을 임의로 금지하지 않는다.
- 연결 시 Storage byte·MIME을 재검증하거나 `PROD-581` metadata의 의미를 다시 정의하지 않는다.
- guest-safe field에 usingProfile auth error를 적용하거나 Profile 공개 이미지를 owner-only Media Node loader에
  의존시키지 않는다.
- production route에서 Tag UI만 숨기고 update input에는 Tag draft를 보내는 partial exclusion을 만들지 않는다.
- 저장 성공 `router.replace`를 dirty guard보다 먼저 실행하거나 saving 중 이탈 뒤 mutation 결과가 적용되게 두지 않는다.
- mobile·desktop별 고정 height로 header 이미지 preview를 만들거나 avatar overlap 공간까지 `3:1` 비율에
  포함하지 않는다.
- web 중앙 column을 internal scroller로 바꿔 기존 document scroll 계약을 깨지 않는다.
- presentation에 저장 성공 문구를 남겨 route가 갱신된 Profile로 복귀하는 production 동작과 경쟁시키지 않는다.
- 확인된 navigation race를 API/BFF timeout이나 response buffering으로 우회하지 않는다.
- `router.replace`의 동기 return을 navigation 완료로 취급해 dirty·saving 상태인 guard를 다시 활성화하지 않는다.
  clean baseline과 terminal `saving` 전이를 먼저 확정한 one-shot navigation은 callback return 뒤 permission을
  회수해도 늦은 `beforeRemove`를 막지 않아야 한다.
- 기존 동기 navigation mock의 통과만으로 Web 비동기 `beforeRemove` ordering을 검증했다고 간주하지 않는다.
- 결과가 불확실한데 draft를 초기화하거나 같은 Media를 다시 upload하지 않는다. 반대로 단순히 `saving`만
  해제하고 중복 submit을 자동 실행 가능하게 두지 않는다.
- 전체 GraphQL proxy를 buffer하거나 공통 timeout을 추가하는 범위 확대를 PROD-613의 단일 mutation 관찰
  근거 없이 수행하지 않는다.

## Risks / Trade-offs

- [UI와 실제 route가 다른 시점에 도착해 disabled state가 production에 노출됨] → route와 entrypoint는 PROD-492에서
  함께 연결하고 PROD-491은 Storybook surface로만 검증한다.
- [Owner capability가 client hint로 축소됨] → API integration test에서 Member·무관 Account와 직접 URL 진입을
  거부하고 server response를 권위로 둔다.
- [Profile Tag 연결 전 partial save가 사용자의 Tag draft를 잃음] → production Tag control은 PROD-527 전까지
  저장 가능하게 노출하지 않고, 연결 뒤 같은 submit action에서 함께 저장한다.
- [Follow Approval Policy가 별도 저장으로 분기되어 text·Media와 불일치함] → enum draft를 같은 submit/save
  boundary에 포함하고, 정책 변경이 기존 Pending Follow Request를 바꾸지 않는지 통합 검증한다.
- [Media upload 성공 뒤 Profile 저장 실패로 orphan Media가 남음] → upload와 relation을 구분하고 draft·재시도를
  보존하며 이번 범위에서는 orphan cleanup을 하지 않는다.
- [권한 확인과 write 사이에 eligibility가 바뀜] → 이미 승인된 실행 중 요청은 완료될 수 있음을 허용하고, 이후
  요청이 action 시작 시 현재 Profile·Membership·Account·Instance 상태로 거부되는지 검증한다.
- [Profile 이미지 저장은 성공하지만 공개 화면에서 보이지 않음] → Profile visibility 기반 relation resolver,
  mutation/query의 동일 Media identity와 ProfileHero 렌더링을 한 전달 단위로 검증한다.
- [한 field upload 실패가 다른 Ready field를 재업로드함] → field별 upload generation과 Ready ID를 route draft가
  분리해 소유하고 실패 field만 다시 시도한다.
- [성공 callback return을 navigation 완료로 오인해 guard가 REPLACE를 다시 차단함] → 실제 Chromium scheduling과
  비동기 `beforeRemove`를 회귀 test로 고정하고 clean baseline·terminal `saving` 상태에서 one-shot REPLACE를
  실행한다. commit 전 새 draft가 생기면 별도 회귀 test로 그 입력 보호를 확인한다.
- [응답 결과가 불확실한 상태에서 중복 저장 또는 이미지 재업로드가 발생함] → 자동 재전송을 금지하고 현재
  draft와 Ready Media ID를 보존한 terminal 복구를 검증한다.
- [확인된 client race를 범용 GraphQL timeout·streaming 변경으로 확대함] → 조사에서 확인한 API/BFF/Relay
  응답 완료 근거를 문서화한 상태로 유지하고 수정 범위를 Profile edit navigation lifecycle에 한정한다.

## Migration Plan

1. PROD-491 presentation과 Storybook state를 route 없이 전달한다.
2. PROD-581의 공개 표현 metadata가 준비되면 PROD-492가 additive Profile Media 관계, API/Core authorization,
   `followPolicy` 저장과 public read를 연결한다.
3. PROD-492가 guest-safe entrypoint, protected route, picker/upload 재시도, Relay·ProfileHero와 navigation을
   연결한다.
4. PROD-613이 post-commit 응답·Relay·navigation 경계를 조사 단계에서 임시 계측으로 확인한 뒤 계측 코드를
   제거하고, 영구 `saving` 회귀 수정과 자동화·Web runtime 증거를 남긴다.
5. PROD-490이 Owner route, text·Media save와 실패 복구를 통합 검증한다.
6. Profile Tag는 PROD-526·527 완료 뒤 같은 editor를 연결하며 `add-profile-tags`가 별도로 archive한다.
7. Settings 진입점이 제공되면 PROD-531이 Follow Approval Policy 제어를 이전하고 Profile 편집의 중복 저장
   경계를 제거한다.
8. rollback 시 production entrypoint를 먼저 비활성화하고 additive API/Media 관계 변경은 해당 migration 정책에
   따라 보존한다.

## Open Questions

없음. root cause와 사용자 관찰 가능한 수정 계약은 PROD-613에 확정됐다. 이 확정은 구현 승인과 별개다.
