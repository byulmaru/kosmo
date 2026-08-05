# Local Profile 편집 화면

## 목적

선택된 Local Profile의 Owner가 Web·Android·iOS에서 같은 정보 구조로 표현 속성을 수정할 수 있는 화면을
제공한다. 화면의 presentation과 실제 권한·조회·저장 연결을 분리해, API가 연결되기 전 UI가 저장 가능한 것처럼
보이거나 권한 없는 사용자가 직접 URL로 편집 화면에 접근하지 않게 한다.

## 출시와 검증 범위

- 현재 Profile edit 제품 출시와 일반 수동 runtime QA 범위는 Web이다.
- 공용 React Native 구현과 자동화 검증은 Web·Android·iOS가 같은 정보 구조와 저장 계약을 유지하도록 계속
  적용한다.
- iOS·Android 실제 기기·simulator runtime QA는 현재 Profile edit 제품 출시 완료 조건과 `PROD-527` PR
  readiness에서 제외하고 Native 출시 gate에서 별도로 수행한다. 공용 코드와 자동화가 플랫폼별 target 계약을
  유지하더라도 이를 Native runtime 완료 증거로 사용하지 않는다.
- Native 출시 전에는 iOS·Android 실제 환경에서 플랫폼별 target, 인접 action 비중첩, 여러 줄 wrapping과 접근성
  동작을 다시 검증한다.

## 정보 구조와 필드

화면은 다음 순서로 구성한다.

1. 상단 제목과 저장 action
2. header 이미지와 겹쳐 보이는 avatar 이미지 편집 영역
3. 표시 이름
4. 소개(bio)
5. 팔로우 요청 자동 승인
6. 프로필 태그

- 표시 이름은 새로 입력하거나 변경할 때 Unicode code point 기준 1~40이다. 서버 구현 정렬 전의 호환 경계로,
  40 code point를 초과하는
  legacy 초기값은 form에 들어온 원문과 정확히 같은 값으로 남겨 둔 경우에만 다른 field와 함께 저장할 수 있다.
  40 code point를 초과한 이름을 한 글자라도 변경하면 같은 1~40 code point 규칙을 적용한다.
- bio는 앞뒤 공백을 제거한 뒤 500자 이하이며 긴 텍스트 입력으로 표현한다.
- `팔로우 요청 자동 승인`은 설명 없는 한 줄 Switch로 표현한다. 독립 설정에 가까운 시각적 위계를 위해
  라벨은 SUIT `16/24`, weight `600`을 사용한다. Switch가 켜지면 `OPEN`, 꺼지면
  `APPROVAL_REQUIRED`로 해석하며, 표시 이름·소개·avatar/header와 같은 Profile draft와 저장 동작에 포함한다.
- Follow Approval Policy를 바꿔도 기존 Pending Follow Request의 상태나 존재는 바뀌지 않는다.
- 프로필 태그는 [Profile Tag 디자인](./profile-tags.md)의 Hashtag Name 정규화·중복·접근성
  계약을 따른다. 개수 상한과 순서·재정렬 계약은 두지 않는다.
- form은 avatar와 header의 현재 이미지를 각각 초기 draft로 표시하며 별도의 `유지` action을 두지 않는다.
  header preview 전체와 avatar preview 전체를 각 field의 단일 편집 button으로 사용하고, 별도의 연필·편집
  button은 두지 않는다. 한쪽을 편집해도 건드리지 않은 다른 쪽의 draft는 현재 값으로 남긴다. 각 field의 편집
  흐름은 교체 선택, 제거, 업로드 대기와 오류를 구분해 표현한다.
- 현재 이미지가 있으면 preview를 눌렀을 때 `이미지 변경`, `이미지 삭제`, `취소` 메뉴를 표시한다. 현재 이미지가
  없으면 메뉴를 거치지 않고 system picker를 연다. 업로드가 실패한 field에는 명시적인 `다시 시도` action을
  제공하며, 다른 field가 이미 Ready라면 실패한 field만 다시 업로드한다.
- header와 avatar button 중앙에는 반투명 원형 scrim 위의 흰색 camera icon을 표시하고, press 중에는 이미지
  전체에 옅은 veil을 더한다. camera icon과 scrim은 장식 요소이며 별도의 focus target이나 중첩 button이 아니다.
  편집 callback이 없거나 form이 disabled/saving 상태면 preview 전체 button을 disabled로 표현한다.
- header 이미지 변경 영역은 모든 지원 폭에서 항상 가로:세로 `3:1`을 유지한다. avatar overlap과 편집
  control을 담는 hero wrapper는 이 비율에 포함하지 않으며 header preview의 높이를 고정값으로 두어 비율을
  왜곡하지 않는다.
- 원본 이미지 비율이 다르면 header 변경 영역의 `3:1` 경계 안에서 중앙 기준 cover crop으로 미리 보이고,
  선택·업로드 과정에서도 container 비율은 바뀌지 않는다.
- Profile Link, handle, location, website, gender, pronouns, contacts와 고정 게시물은 이 화면에 포함하지 않는다.
- Settings 진입점이 제공되기 전까지 Follow Approval Policy 조회·변경은 Profile 편집이 소유한다. 이후
  `PROD-531`이 Settings로 제어를 이전하고 Profile 편집에서 중복 제어를 제거한다.

## 화면과 연결 경계

### Presentation

- `ProfileEditScreen`과 `ProfileEditForm`은 route나 Relay Environment를 직접 읽지 않는다.
- 값, validation, 이미지 상태, `followPolicy` draft, 저장 상태와 callback을 controlled prop으로 받는다.
- 제출 callback이 없거나 초기값에서 바뀐 draft가 없으면 저장 action을 disabled로 표현한다. 사용자가 원하는
  field만 편집하면 해당 draft가 dirty가 되고, 저장은 현재 draft 전체를 제출한다. 성공을 가장하거나 임시 local
  persistence를 만들지 않는다.
- UI 선제작 단계에서는 표시 이름·bio와 Profile Tag의 로컬 입력, 추가·제거, client validation을
  동작하게 한다.
- dirty, validation, 이미지 업로드 대기·오류, saving, failure와 retry는 production 연결 전에는
  Storybook의 controlled state로 검증한다.
- Switch는 `followPolicy` enum을 controlled draft로 유지하며 별도 즉시 저장하지 않는다. 토글만 바꿔도
  draft가 dirty가 되고, 저장 callback에는 다른 Profile draft와 함께 현재 enum 값이 전달된다.
- 이미지 업로드 오류는 [공통 이미지 업로드 오류 안내](./media-upload-errors.md)의 단계·원인 분류와 안전한
  한국어 문구를 사용하고 현재 image draft를 보존한다. `{subject}`는 `아바타 이미지` 또는 `헤더 이미지`로
  한정하며 Storage Service 원문 message나 caller가 제공한 임의 문구를 사용자에게 그대로 표시하지 않는다.

### Production route와 저장

- 공개 Profile 화면은 nullable top-level `selectedProfileForEdit` 결과의 `id`가 현재 표시 중인 Profile `id`와
  정확히 같을 때만 편집 button을 렌더한다. guest, selected Profile이 없는 session과 편집 부적격 Account에는
  이 field가 GraphQL authorization error 없이 `null`을 반환하며 disabled placeholder를 표시하지 않는다.
- shared navigation은 같은 nullable `selectedProfileForEdit` 결과가 있을 때만 `프로필 편집` 항목을 표시하고
  canonical `/profile-edit` route를 연다. full Web sidebar, compact Web icon rail과 mobile drawer의 위치·아이콘,
  active·close 동작과 bottom tab 제외는 [레이아웃 브레이크포인트](./breakpoints.md)가 소유한다. 공개 Profile의
  기존 편집 button은 유지하며, shell은 별도의 client-side 권한 조건이나 fallback route를 만들지 않는다.
- 실제 `/profile-edit` protected route는 `selectedProfileForEdit`이 반환한 selected Active/Normal Local
  Profile과 Owner Membership을 server-authoritative하게 확인한 뒤에만 화면을 제공한다. 직접 URL이나 stale
  link로 진입했지만 편집할 수 없으면 form 대신 `이 프로필을 수정할 수 없어요`와 `프로필로 돌아가기` action을
  가진 StateView를 표시한다.
- selected Profile id나 `Profile.instance.kind`만으로 Owner 또는 편집 권한을 추측하지 않는다.
- mutation은 route query 결과를 권한 증거로 재사용하지 않는다. action 시작 시 selected Profile, Owner
  Membership과 Account의 현재 eligibility를 server-authoritative하게 다시 확인하되 명시적인 `FOR UPDATE`,
  shared lock 또는 atomic guard로 해당 상태를 commit까지 고정하지 않는다. 확인 뒤 동시에 eligibility가
  바뀌더라도 이미 승인된 실행 중 요청은 완료될 수 있고, 이후 요청부터 거부한다.
- route가 초기값 조회, 제출 callback, Media 선택·업로드, Relay 갱신, 공개 Profile avatar/header·Tag 표시, 성공
  navigation과 production 진입점을 연결한다.
- route는 현재 `followPolicy`를 초기 draft로 조회하고 표시 이름·소개·Media 관계와 같은 저장 동작으로
  제출한다. Settings 이전 전까지 이 Profile 편집 경계를 우회하는 별도 정책 저장을 만들지 않는다.
- production route는 현재 Profile Tag를 초기 draft로 조회해 기존 editor를 렌더하고 다른 Profile 값과 전체 Tag
  목록을 같은 update input으로 제출한다. server validation은 Tag field에 연결하고 성공 payload의 Hashtag Node
  목록으로 편집 baseline과 공개 Profile Relay record를 동기화한다.

### Media 관계와 공개 표시

- Profile과 Media의 avatar/header 연결은 `profile_media` 관계로 저장한다. 관계는 UUIDv7 identity,
  `profile_id`, `media_id`, `AVATAR | HEADER` kind와 생성 시각을 가지며 Profile마다 kind 하나만 존재한다.
  Profile 삭제는 관계만 cascade하고 Media row/blob은 삭제하지 않는다. 기존 Profile backfill은 수행하지 않는다.
- update input에서 avatar/header field 생략은 관계 유지, Media global ID는 교체, `null`은 해당 kind 관계 제거다.
  요청에 포함된 두 Media를 먼저 모두 검증한 뒤 displayName, bio, `followPolicy`와 관계 upsert/delete를 하나의
  transaction에서 반영한다. 하나라도 존재하지 않거나 다른 Profile 소유, Remote 또는 Ready가 아니면 전체를
  rollback한다.
- Profile 연결은 `PROD-581`이 완료 시 저장한 공개 URL과 media type persistence를 소비한다. 공개 Profile
  projection은 렌더링에 필요한 Media identity와 URL만 추가하며 media type GraphQL field는 이 범위에 포함하지
  않는다. Profile edit는 Storage byte·MIME을 다시 검증하거나 Media upload 인프라를 복제하지 않는다.
- 공개 `Profile.avatar`와 `Profile.header`는 해당 Profile 조회 정책을 통과한 viewer에게 Profile 관계를 통해
  Media identity와 표시 URL을 제공한다. 일반 Media Node의 owner-only loader 정책은 넓히지 않는다. 초기 query와
  update payload는 같은 Media `id`와 표시 field를 선택해 Relay가 같은 record를 정규화하며 `ProfileHero`가 실제
  avatar/header를 표시한다.

### Upload, 실패 복구와 navigation

- route wrapper가 각 field의 local asset, preview URI, upload generation과 Ready Media global ID를 소유한다.
  선택 즉시 local preview를 표시하고 `issueMediaUploadUrl → PUT → completeMediaUpload`을 실행한다. field가
  교체되거나 route가 unmount된 뒤 도착한 stale completion은 draft에 반영하지 않으며 Web object preview는
  교체·삭제·unmount 때 해제한다.
- 업로드 중이거나 실패한 field가 있으면 저장을 disabled로 둔다. 업로드 실패는 text·policy와 다른 image draft를
  보존하고 `updateProfile`을 호출하지 않는다. `다시 시도`는 실패한 field의 upload sequence만 다시 수행한다.
  Profile 저장 실패는 이미 Ready인 Media ID를 포함한 전체 draft를 보존하므로 저장 재시도에서 재업로드하지 않는다.
- dirty draft에서 route navigation, Web browser back과 Android hardware back을 시도하면 공통 confirmation UI로
  `변경사항을 버릴까요?`, `계속 편집`, `버리기`를 표시한다. `버리기`는 원래 navigation action을 한 번만
  재실행한다. 저장 중에는 navigation을 차단하고 확인 UI를 열지 않는다.
- 저장 성공 시 dirty guard를 먼저 해제하고 mutation payload를 Relay에 정규화한 뒤, 갱신된
  `Profile.relativeHandle` route로 `router.replace`한다. 별도 성공 toast나 presentation 성공 문구는 표시하지 않는다.
- Web `router.replace`의 동기 return은 실제 route state commit이 아니다. 성공 저장은 Relay normalization으로
  제출 draft를 clean baseline에 맞추고 `saving`을 terminal 상태로 끝낸 render에서 성공 REPLACE를 one-shot으로
  실행한다. clean baseline이 유지되는 동안에는 permission callback이 return한 뒤에도 dirty·saving guard가
  비활성 상태이므로 비동기 `beforeRemove`가 성공 REPLACE를 다시 막지 않는다.
- 실제 route commit 전에 사용자가 새 draft를 만들면 그 입력의 보호가 성공 REPLACE보다 우선한다. route는
  dirty guard를 다시 활성화해 대기 중인 REPLACE를 공통 discard confirmation으로 가로채며, 새 입력을 버리고
  강제로 이동하지 않는다.
- 성공 REPLACE가 no-op이거나 완료되지 않아도 편집 화면은 잠금 상태에 남지 않으며 현재 text·policy와 Ready
  avatar/header Media ID를 보존한다. mutation 자동 재전송이나 이미지 자동 재업로드는 실행하지 않는다.
- 표시 이름은 client omission에 의존하지 않는다. 서버는 기존 저장 원문과 정확히 같은 40 code point 초과
  displayName을 허용하고, 원문과 달라진 값에만 Unicode code point 기준 1~40 규칙을 적용한다. Remote Profile
  materialization이 공유하는 validation 계약은 변경하지 않는다.

- 위 권한·조회·저장 계약이 준비되기 전에는 route 파일과 production 편집 버튼을 만들거나 활성화하지 않는다.

권한과 route 경계의 durable decision은
[ADR 0021](../domain/decisions/0021-profile-edit-selected-owner-route-boundary.md)을 따른다.

## Profile Tag 편집

- 기본 상태에서는 현재 TagChip과 추가 입력을 같은 섹션에 둔다.
- 태그를 추가하거나 기존 TagChip을 제거할 수 있다. 개수 상한을 두지 않으며 순서 변경
  control이나 drag gesture를 제공하지 않는다.
- 추천, 자동완성, trend, 검색 link를 표시하지 않는다.
- 저장과 서버 validation, Relay 동기화는 production route가 같은 presentation component를 재사용해 제공한다.
  별도의 태그 편집기를 다시 만들지 않는다.

## 반응형 레이아웃

- Web은 기존 KOSMO shell 안의 중앙 route로 제공하며 modal이나 별도 desktop-only route를 만들지 않는다.
- 중앙 편집 surface는 최대 `600px`를 유지한다.
- 상단 navigation header는 shell이 소유하는 safe-area inset을 제외한 content 높이를 정확히 `48px`로 유지한다.
  뒤로가기 action은 이 행의 `48×48` 전체를 입력 target으로 사용하고 제목·저장 action은 같은 행 안에서 정렬한다.
- header 이미지 변경 영역은 surface 폭을 기준으로 `aspect-ratio: 3 / 1`을 적용한다. 따라서 `600px`
  중앙 surface에서는 `600×200`, `390px` mobile에서는 `390×130`이며 임의 폭 `W`에서는 높이가
  `W / 3`이 된다.
- `1440px`에서는 full sidebar와 우측 rail 사이 중앙 컬럼에, `1024px`에서는 icon rail 다음 중앙 컬럼에
  배치한다. 일반 shell breakpoint는 [breakpoints.md](./breakpoints.md)를 따른다.
- desktop 상단 제목·저장 영역은 중앙 컬럼 안에서 sticky하게 유지할 수 있지만 document scroll 소유권을
  바꾸지 않는다.
- Web `< compact`와 Android/iOS는 mobile header·safe area·하단 tab chrome을 유지하며 form은 전체 너비를
  사용한다.
- form component는 presentation-independent하게 유지해 후속에서 modal wrapper가 필요해도 필드와 상태
  로직을 재작성하지 않게 한다. 현재 production UX는 전용 route다.

## 접근성과 상태 표현

- Profile Tag 제거 action은 시각 크기 `32×32`를 유지하면서 실제 입력 target을 Web `32×32 CSS px`, iOS
  `44×44 pt`, Android `48×48 dp`로 제공한다. 공용 component가 시각 geometry와 platform별 입력 target을
  분리해 compact rhythm과 각 플랫폼 접근성 기준을 함께 지킨다.
- text action은 최소 높이 `36`을 기준으로 한다.
- 저장, 태그 제거와 header·avatar 각각의 이미지 전체 button은 대상과 상태를 포함한 accessibility label/state를
  제공한다. camera icon은 접근성 tree에서 숨기고 preview button 하나만 focus target으로 노출한다.
- validation, disabled, saving과 failure를 색만으로 구분하지 않는다.
- presentation은 저장 성공 문구를 남기지 않는다. production route가 성공 payload로 갱신된 Profile을 확보한 뒤
  해당 Profile로 복귀한다.
- presentation 상태 카탈로그와 production route는 실패 뒤 표시 이름·bio·Profile Tag·이미지 선택 상태를
  보존한다. production은 text·policy·Tag·Ready image draft를 같은 저장 action으로 다시 제출할 수 있게 한다.
- 긴 표시 이름·bio, 빈 값, 여러 개·긴 태그, 이미지 없음과 오류, compact/desktop 폭을 상태 카탈로그에서
  확인한다.

## Figma 대응

- `04 Screens - Mobile`의 기존 Profile Edit 원본은 `07 Archive`에 보관한 뒤 현재 범위로 정리한다.
- `05 Screens - Web`의 Profile 영역에 1440/1024 두 프레임을 추가한다.
- Mobile/Web 모두 상단 navigation header의 safe area 제외 높이를 `48px`로 고정하고 뒤로가기 action에
  `48×48` 영역을 배정한다.
- 실제 `Header image preview` layer에 `3:1` ratio lock을 적용하고, avatar overlap을 배치하는 hero wrapper와
  preview layer를 분리한다. header preview 전체와 avatar preview 전체를 각각 단일 button으로 사용하며 중앙
  camera affordance와 pressed veil을 표현한다.
- 별도의 연필 button이나 두 이미지를 함께 다루는 `유지`·`교체`·`제거` action row는 두지 않는다.
- 기존 모바일 시안의 `분류 태그 4/8`, AI 자동 추천과 현재 범위 밖 필드는 사용하지 않는다.
- Figma 작업 환경에서는 [typography.md](./typography.md)의 대치 폰트와 Foundation variable, `02 Components`의
  현행 primitive를 사용한다.

## 전달 경계

- `PROD-491`: route 없는 presentation component, 로컬 입력·validation·태그 추가·제거 UI, 이미지 controlled
  state와 Storybook 상태 카탈로그.
- `PROD-492`: `PROD-581` 위에서 Profile Media 관계, guest-safe selected Local Owner query, protected route와
  공개 Profile의 initial entrypoint, 초기값, submit/Relay, Media picker·upload, 공개 ProfileHero 이미지와 성공
  navigation을 연결한다.
- `PROD-660`: 기존 selected Owner 권한과 `/profile-edit` route를 재사용해 full Web sidebar, compact Web icon
  rail과 mobile drawer의 shared navigation entrypoint를 연결하고 자체 Shell Storybook·component·Web E2E
  검증과 별도 OpenSpec 생명주기를 소유한다. `add-local-profile-edit`의 통합·archive 책임은 이전하지 않는다.
- `PROD-527`: `PROD-491`의 Profile Tag editor를 재사용한 저장·서버 오류·Relay 연결과 공개 Profile 표시.
- `PROD-531`: Settings 진입점이 제공된 뒤 Follow Approval Policy 제어를 이전하고 Profile 편집과의 중복
  저장 소유권을 제거한다.
- `PROD-490`: 두 Profile 편집 slice의 통합 검증, OpenSpec 정합성 확인과 archive.
