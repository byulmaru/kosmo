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

`PROD-613`에서 avatar/header 두 이미지를 포함한 저장이 DB에는 commit됐지만 기존 Web 탭은 영구 `saving`에
남는 회귀가 관찰됐다. 새 탭에서는 변경된 Profile을 조회할 수 있어 현재 확인된 실패 경계는 transaction 이후
GraphQL child field resolution·API response, BFF upstream/downstream body, browser body parse, Relay callback과
navigation 완료 사이다. 어느 하위 경계가 원인인지는 아직 계측으로 확정되지 않았다.

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
- DB commit 이후 응답·Relay·navigation 이상을 재현 가능한 경계로 특정하고 기존 저장 성공·실패 복구 계약이
  영구 `saving` 없이 끝나게 한다.
- 저장 결과를 확인하지 못한 경우에도 현재 draft와 Ready avatar/header Media ID를 보존해 이미지 재업로드
  없이 안전하게 복구·재시도하게 한다.

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
- `updateProfile` transaction이 끝난 뒤에도 mutation payload의 `relativeHandle`, `avatar`, `header` child
  resolver와 BFF response body streaming이 남아 있어 DB commit은 Relay `onCompleted` 도착을 보장하지 않는다.
- Web BFF는 upstream response body를 그대로 전달하고 client Relay network는 fetch와 body parse에 명시적인
  deadline을 두지 않는다. route는 submit 시작 시 `saving`으로 전환하고 실패 callback에서만 명시적으로
  `idle`로 복구하므로 callback이나 성공 navigation이 끝나지 않으면 편집과 이탈이 함께 잠길 수 있다.
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
11. `PROD-613`은 text-only 저장과 Ready avatar/header 두 장을 포함한 저장을 분리하고, 같은 correlation으로
    browser 요청 시작·body parse, BFF upstream headers/body와 downstream body 종료, API transaction 완료와
    Profile child field resolution, Relay `onCompleted`/`onError`, navigation guard effect와 실제 route
    replacement 시점을 기록해 먼저 멈춘 경계를 특정한다.
12. 확인된 경계를 지연·응답 유실·callback 미도착 또는 route replacement 실패로 재현하는 가장 좁은 fault
    injection seam을 기존 API·BFF·app test surface에 둔다. 수정 전에는 영구 `saving`을 재현하고 수정 뒤에는
    정상 성공이나 draft를 보존한 복구 가능 상태로 끝나는지 검증한다.
13. 계측 결과에 맞는 가장 좁은 경계에서 복구한다. UI는 응답 결과가 불확실해도 영구 잠금에 남지 않고 기존
    draft와 Ready Media ID를 유지해야 하며, 자동 재업로드나 자동 중복 mutation을 실행하지 않는다. 전체
    GraphQL timeout·streaming 정책 변경은 실제 원인이 공통 경계로 확인되고 별도 영향 범위가 정리된 경우에만
    선택한다.
14. 정상 성공, GraphQL/transport 실패, post-commit 응답 이상과 navigation 실패를 자동화하고 실제 Web dev
    환경에서 동일 correlation으로 저장을 확인한다. 원인과 적용 경계, 실행하지 않은 Native QA는 PROD-613
    PR에 기록하고 통합 검증·archive 증거는 PROD-490에 넘긴다.

### Allowed Alternatives

- action 시작 시의 eligibility 조회는 동등한 server-authoritative join으로 구성할 수 있다. 이미 승인된 실행 중
  요청을 취소하기 위한 `FOR UPDATE`, shared lock이나 conditional write는 이 change에 추가하지 않는다.
- Profile 관계 resolver는 기존 Media object identity를 반환하거나 같은 Relay identity를 유지하는 좁은 projection을
  사용할 수 있다. 어느 방식이든 일반 Media Node의 owner-only 조회 권한을 공개로 넓히지 않는다.
- desktop sticky action은 shell document scroll을 유지하는 한 route header 또는 중앙 surface 내부 bar로 구현할 수
  있다.
- form은 future modal wrapper에서도 재사용할 수 있지만 현재 production entry는 dedicated route여야 한다.
- 계측은 기존 Sentry/logging surface의 좁은 timing field나 test-only seam을 사용할 수 있다. 새 tracing
  dependency나 범용 middleware는 확인된 원인이 여러 GraphQL operation에 공통이라는 증거가 있을 때만
  허용한다.
- terminal 복구는 확인된 멈춤 경계에 따라 client operation deadline, BFF upstream/body 종료 처리 또는
  route navigation 복구로 둘 수 있다. 어느 대안도 자동 mutation 재전송·Media 재업로드를 만들거나 기존
  Relay normalization·dirty guard 순서를 깨면 안 된다.

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
- 계측 전에 client timeout이나 navigation state 변경을 정답으로 고정해 실제 child resolver·BFF stream·Relay
  경계를 가리지 않는다.
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
- [관측 전에 timeout이나 navigation workaround를 추가해 실제 post-commit 병목을 숨김] → 단계별 correlation과
  fault injection으로 최초 정지 경계를 기록한 뒤 가장 좁은 수정 범위를 선택한다.
- [응답 결과가 불확실한 상태에서 중복 저장 또는 이미지 재업로드가 발생함] → 자동 재전송을 금지하고 현재
  draft와 Ready Media ID를 보존한 terminal 복구를 검증한다.
- [범용 GraphQL 계측·streaming 변경이 다른 operation에 회귀를 만듦] → PROD-613에서 확인된 단계만 계측하고
  공통 경계 변경이 필요하면 영향 범위와 별도 authority를 먼저 정리한다.

## Migration Plan

1. PROD-491 presentation과 Storybook state를 route 없이 전달한다.
2. PROD-581의 공개 표현 metadata가 준비되면 PROD-492가 additive Profile Media 관계, API/Core authorization,
   `followPolicy` 저장과 public read를 연결한다.
3. PROD-492가 guest-safe entrypoint, protected route, picker/upload 재시도, Relay·ProfileHero와 navigation을
   연결한다.
4. PROD-613이 post-commit 응답·Relay·navigation 경계를 계측하고 영구 `saving` 회귀를 수정해 자동화와 Web
   runtime 증거를 남긴다.
5. PROD-490이 Owner route, text·Media save와 실패 복구를 통합 검증한다.
6. Profile Tag는 PROD-526·527 완료 뒤 같은 editor를 연결하며 `add-profile-tags`가 별도로 archive한다.
7. Settings 진입점이 제공되면 PROD-531이 Follow Approval Policy 제어를 이전하고 Profile 편집의 중복 저장
   경계를 제거한다.
8. rollback 시 production entrypoint를 먼저 비활성화하고 additive API/Media 관계 변경은 해당 migration 정책에
   따라 보존한다.

## Open Questions

- DB commit 이후 GraphQL child field, BFF response body, Relay callback과 navigation 중 실제로 처음 멈추는
  경계는 무엇인가? PROD-613의 계측과 fault injection으로 구현 수단을 선택하기 전에 확정한다.
