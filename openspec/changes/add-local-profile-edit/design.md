## Context

현재 client session은 selected Profile id를 제공하고 `Profile.instance.kind`로 Local 여부를 읽을 수 있지만
Membership Role이 Owner인지 확인할 public client contract는 없다. 기존 GraphQL update는 임의 Profile id와 scalar
값을 받고 avatar/header 관계를 지원하지 않는다. `PROD-491`은 presentation을 선제작하고 `PROD-492`는 권한·route·
실제 저장을 연결하며 부모 `PROD-490`이 통합 검증과 archive를 소유한다.

Profile Tag는 `add-profile-tags`가 별도 저장·공개 계약을 소유한다. 이 change의 form은 editor presentation만
만들며, `PROD-527`이 같은 component를 연결한다. Follow Approval Policy는 현재 Profile 편집의 controlled draft와
같은 저장 경계에 포함하고, Settings 진입점이 제공되면 `PROD-531`이 제어를 이전한다.

## Goals / Non-Goals

**Goals:**

- route·Relay와 분리된 universal Profile edit presentation과 상태 catalog를 제공한다.
- selected Active/Normal Local Profile Owner만 실제 route와 저장을 사용할 수 있게 한다.
- displayName, bio, `followPolicy`와 avatar/header 관계를 검증하고 원자적으로 저장한다.
- desktop shell 중앙 600px route와 mobile/native 정보 구조, 접근성을 일관되게 유지한다.
- header 이미지 변경 영역을 hero wrapper와 분리하고 모든 지원 폭에서 `3:1`로 유지한다.
- Profile Tag editor UI를 한 번 만들고 Tag 연결 change가 재사용할 seam을 제공한다.

**Non-Goals:**

- Profile Tag storage·GraphQL·Relay·공개 표시
- Settings 전체 정보 구조와 `PROD-531`의 Follow Approval Policy 이전, Profile Link·handle과 Profile lifecycle
- Media upload 인프라, 다른 Profile Media 재사용, crop editor
- Admin role 제거, client-side Owner 추측과 API 미연결 local persistence

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
4. usingProfile 경계 안에서 selected Profile의 Local origin, Active/Normal 상태와 Owner Membership을 반환하는
   server-authoritative query/capability를 마련하고, 검증 전에는 route content와 entrypoint를 노출하지 않는다.
5. update service를 selected Profile identity 기준으로 정렬하고 displayName·bio·`followPolicy`와 avatar/header
   관계를 한 transaction에서 변경한다. Media가 같은 Profile의 Ready Local Media인지 검증하고 관계 제거 때
   Media는 남긴다.
6. route가 초기값, `followPolicy`를 포함한 submit, picker/upload 결과, Relay payload와 성공 navigation을 연결한다.
   Tag API가 없는 동안 production Tag editor는 숨기거나 disabled로 두고 저장 가능하다고 오인시키지 않는다.
7. Profile Tag 제거 action은 시각 크기 `32×32`와 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`,
   Android `48×48 dp`를 분리하고 text action은 최소 높이 `36`을 사용한다.

### Allowed Alternatives

- Owner authorization은 usingProfile query가 role/capability를 직접 제공하거나 protected route query가 별도
  owner capability를 제공할 수 있다. 어느 방식이든 selectedProfileId나 Local origin의 client 추측은 금지한다.
- desktop sticky action은 shell document scroll을 유지하는 한 route header 또는 중앙 surface 내부 bar로 구현할 수
  있다.
- form은 future modal wrapper에서도 재사용할 수 있지만 현재 production entry는 dedicated route여야 한다.

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
- mobile·desktop별 고정 height로 header 이미지 preview를 만들거나 avatar overlap 공간까지 `3:1` 비율에
  포함하지 않는다.
- web 중앙 column을 internal scroller로 바꿔 기존 document scroll 계약을 깨지 않는다.
- presentation에 저장 성공 문구를 남겨 route가 갱신된 Profile로 복귀하는 production 동작과 경쟁시키지 않는다.

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
  보존하며 orphan cleanup은 Media 계약을 따른다.

## Migration Plan

1. PROD-491 presentation과 Storybook state를 route 없이 전달한다.
2. PROD-492가 API/Core authorization·Media 관계·`followPolicy` 저장과 protected route를 연결하고 production
   entrypoint를 활성화한다.
3. PROD-490이 Owner route, text·Media save와 실패 복구를 통합 검증한다.
4. Profile Tag는 PROD-526·527 완료 뒤 같은 editor를 연결하며 `add-profile-tags`가 별도로 archive한다.
5. Settings 진입점이 제공되면 PROD-531이 Follow Approval Policy 제어를 이전하고 Profile 편집의 중복 저장
   경계를 제거한다.
6. rollback 시 production entrypoint를 먼저 비활성화하고 additive API/Media 관계 변경은 해당 migration 정책에
   따라 보존한다.

## Open Questions

없음.
