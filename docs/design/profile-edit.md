# Local Profile 편집 화면

## 목적

선택된 Local Profile의 Owner가 Web·Android·iOS에서 같은 정보 구조로 표현 속성을 수정할 수 있는 화면을
제공한다. 화면의 presentation과 실제 권한·조회·저장 연결을 분리해, API가 연결되기 전 UI가 저장 가능한 것처럼
보이거나 권한 없는 사용자가 직접 URL로 편집 화면에 접근하지 않게 한다.

## 정보 구조와 필드

화면은 다음 순서로 구성한다.

1. 상단 제목과 저장 action
2. header 이미지와 겹쳐 보이는 avatar 이미지 편집 영역
3. 표시 이름
4. 소개(bio)
5. 팔로우 요청 자동 승인
6. 프로필 태그

- 표시 이름은 새로 입력하거나 변경할 때 1~40자다. 서버 계약 정렬 전의 호환 경계로, 40자를 초과하는
  legacy 초기값은 form에 들어온 원문과 정확히 같은 값으로 남겨 둔 경우에만 다른 field와 함께 저장할 수 있다.
  40자를 초과한 이름을 한 글자라도 변경하면 1~40자 규칙을 적용한다.
- bio는 500자 이하이며 긴 텍스트 입력으로 표현한다.
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
- 이미지 업로드 오류는 해당 field의 `<label> 이미지 업로드에 실패했어요. 다시 시도해 주세요.` 문구로
  안내하고 현재 image draft를 보존한다. 내부 오류 detail이나 caller가 제공한 임의 문구를 사용자에게 그대로
  표시하지 않는다.

### Production route와 저장

- 실제 `/profile-edit` protected route는 GraphQL usingProfile 경계를 통과한 selected Active/Normal Local
  Profile과 Owner Membership을 server-authoritative하게 확인한 뒤에만 화면을 제공한다.
- selected Profile id나 `Profile.instance.kind`만으로 Owner 또는 편집 권한을 추측하지 않는다.
- route가 초기값 조회, 제출 callback, Media 선택·업로드, Relay 갱신, 성공 navigation과 production 진입점을
  연결한다.
- route는 현재 `followPolicy`를 초기 draft로 조회하고 표시 이름·소개·Media 관계와 같은 저장 동작으로
  제출한다. Settings 이전 전까지 이 Profile 편집 경계를 우회하는 별도 정책 저장을 만들지 않는다.
- 위 권한·조회·저장 계약이 준비되기 전에는 route 파일과 production 편집 버튼을 만들거나 활성화하지 않는다.

권한과 route 경계의 durable decision은
[ADR 0021](../domain/decisions/0021-profile-edit-selected-owner-route-boundary.md)을 따른다.

## Profile Tag 편집

- 기본 상태에서는 현재 TagChip과 추가 입력을 같은 섹션에 둔다.
- 태그를 추가하거나 기존 TagChip을 제거할 수 있다. 개수 상한을 두지 않으며 순서 변경
  control이나 drag gesture를 제공하지 않는다.
- 추천, 자동완성, trend, 검색 link를 표시하지 않는다.
- 저장과 서버 validation, Relay 동기화는 Profile Tag 연결 이슈가 같은 presentation component를 재사용해
  제공한다. 별도의 태그 편집기를 다시 만들지 않는다.

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
- 실패 뒤 표시 이름·bio·Profile Tag·이미지 선택 상태를 보존해 같은 draft로 재시도할 수 있게 한다.
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
- `PROD-492`: protected route, selected Local Owner capability/query, 초기값, submit/Relay, Media picker·upload,
  성공 navigation과 production 진입점.
- `PROD-527`: `PROD-491`의 Profile Tag editor를 재사용한 저장·서버 오류·Relay 연결과 공개 Profile 표시.
- `PROD-531`: Settings 진입점이 제공된 뒤 Follow Approval Policy 제어를 이전하고 Profile 편집과의 중복
  저장 소유권을 제거한다.
- `PROD-490`: 두 Profile 편집 slice의 통합 검증, OpenSpec 정합성 확인과 archive.
