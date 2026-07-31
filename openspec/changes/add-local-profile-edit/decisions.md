## Context

이 기록은 `PROD-490`, `PROD-491`, `PROD-492`와 canonical Profile edit 문서에서 승인한 presentation·route·권한
경계를 반영한다. Profile Tag 저장·공개 표시는 별도 계약이 소유하지만 Follow Approval Policy는 현재 Profile
편집 draft/save 경계에 포함하고, Settings 진입점이 제공되면 `PROD-531`이 제어를 이전한다.

## Decision Records

### 실제 Profile edit route는 selected Local Owner 검증 뒤에만 제공한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`,
  `PROD-492`
- Status: Active
- Context / Problem: client의 selected Profile id와 Local origin만으로 Membership Owner를 판정할 수 없어 UI-only
  route가 직접 URL로 권한 없는 사용자에게 노출될 수 있다.
- Decision Outcome: protected `/profile-edit` route와 production entrypoint는 usingProfile 경계의 selected
  Active/Normal Local Profile과 Owner Membership을 server-authoritative하게 확인하고 초기값·submit까지 연결할 때만
  제공한다. 편집 불가 direct/stale route는 form 대신 Profile 복귀 action이 있는 StateView를 제공한다.
- Alternatives Considered: Local origin을 client-side 권한으로 사용하는 방식은 Member와 Owner를 구분하지 못해
  제외했다. UI slice에 disabled route를 먼저 두는 방식은 직접 URL 노출과 성공 가능성 오해가 있어 제외했다.
- Consequences: `PROD-491`은 route 파일을 만들지 않고 `PROD-492`가 권한·route·저장을 함께 검증한다.
- Confirmation / Follow-up: Owner·Member·무관 Account, guest와 직접 URL 진입을 API·route integration에서 검증한다.

### Profile edit presentation은 controlled component로 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-491`, `PROD-527`
- Status: Active
- Context / Problem: UI를 API 전에 검증하면서도 route·Relay·Media와 Tag 저장 흐름을 중복 구현하지 않아야 한다.
- Decision Outcome: `ProfileEditScreen`·`ProfileEditForm`은 값, validation, image state, save state와 optional callback을
  controlled prop으로 받고 Expo Router·Relay를 직접 읽지 않는다. callback이 없으면 저장을 disabled로 둔다.
  Profile Tag editor도 같은 presentation에 한 번만 만들고 `PROD-527`이 연결한다.
- Alternatives Considered: route component 안에 form state와 mutation을 함께 두는 방식은 UI-only slice와 Storybook
  검증을 불가능하게 해 제외했다. Tag editor를 PROD-527에서 재작성하는 방식은 interaction·접근성 계약을
  중복시켜 제외했다.
- Consequences: controlled state catalog가 production wiring과 독립적으로 존재하며 후속 modal wrapper도 form을
  재사용할 수 있다.
- Confirmation / Follow-up: Storybook state와 후속 integration test에서 같은 component boundary를 사용하는지
  확인한다.

### 변경하지 않은 avatar와 header는 현재 값을 암묵적으로 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`
- Status: Active
- Context / Problem: 현재 이미지를 유지하기 위해 별도 action을 선택하게 하면 form의 초기값과 사용자의 실제
  변경 의도가 중복되고, header와 avatar 중 하나만 바꾸는 일반적인 흐름이 불필요하게 복잡해진다.
- Decision Outcome: 현재 avatar와 header를 각 field의 초기 draft로 표시하고 별도의 `유지` action이나 두 이미지를
  묶은 action row를 두지 않는다. 각 preview의 편집 control은 해당 field draft만 변경하며 건드리지 않은 이미지는
  현재 값으로 남는다. 저장은 사용자가 원하는 field를 편집한 뒤의 현재 draft를 제출한다.
- Alternatives Considered: 두 이미지 공통 `유지`·`교체`·`제거` row는 field별 대상이 모호하고 초기값을 다시
  확인하게 해 제외했다. 각 이미지 옆에 `유지` 버튼을 두는 방식도 아무 변경이 없는 상태를 action처럼 보여 제외했다.
- Consequences: 초기 상태는 dirty가 아니며 submit callback이 없거나 어떤 field도 바뀌지 않았으면 저장을 disabled로
  표현한다. 교체·제거·업로드 상태는 header와 avatar의 개별 편집 흐름에서 표현한다.
- Confirmation / Follow-up: 한 이미지 field만 편집했을 때 다른 이미지 draft가 그대로이고, Figma와 Storybook에
  공통 유지 action row가 없는지 확인한다.

### Web Profile edit는 shell 중앙 dedicated route를 사용한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `PROD-491`, `PROD-492`
- Status: Active
- Context / Problem: 모바일 시안만 있는 상태에서 desktop을 modal 또는 route 중 어떤 surface로 제공할지 정해야
  shell breakpoint와 navigation을 일관되게 설계할 수 있다.
- Decision Outcome: Web은 기존 shell 안의 최대 600px 중앙 dedicated route를 사용한다. 1440은 full sidebar·right
  rail 사이, 1024는 icon rail 다음에 놓고 form의 정보 구조는 mobile/native와 공유한다.
- Alternatives Considered: modal은 future wrapper로 허용하지만 현재 navigation과 긴 form을 담는 primary surface로는
  사용하지 않는다. 독립 desktop-only route tree는 universal Expo Router 계약을 깨므로 제외했다.
- Consequences: 중앙 action은 sticky할 수 있지만 document scroll 소유권을 유지하고 별도 breakpoint를 만들지 않는다.
- Confirmation / Follow-up: 390, 1024, 1440 catalog와 Figma frame에서 shell 배치와 wrapping을 확인한다.

### Header 이미지 변경 영역은 모든 폭에서 3:1을 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`
- Status: Active
- Context / Problem: header preview와 avatar·action을 포함한 hero wrapper를 같은 고정 높이로 취급하면 mobile과
  desktop의 서로 다른 surface 폭에서 이미지 변경 영역의 비율이 달라진다.
- Decision Outcome: 실제 header 이미지 preview layer는 모든 지원 폭에서 가로:세로 `3:1`을 유지한다.
  avatar overlap과 편집 action은 별도 hero wrapper에 배치하고, 다른 비율의 원본은 preview 경계 안에서 중앙
  기준 cover crop한다.
- Alternatives Considered: mobile·desktop별 고정 높이는 중간 폭에서 다시 왜곡되므로 제외했다. hero wrapper
  전체를 `3:1`로 고정하면 avatar overlap 공간까지 이미지 비율에 포함되어 제외했다.
- Consequences: `390px` preview는 `390×130`, `600px` preview는 `600×200`이며 임의 폭에서는 높이를
  `width / 3`으로 계산한다. wrapper의 추가 높이는 preview 비율을 바꾸지 않는다.
- Confirmation / Follow-up: Figma ratio lock과 component/Storybook에서 390·600·중간 폭의 계산된 크기를
  검증한다.

### Header와 avatar preview 전체를 단일 이미지 편집 button으로 사용한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`, 2026-07-29 사용자 확인 A안
- Status: Active
- Context / Problem: preview 위의 작은 연필 button은 이미지 자체와 편집 동작의 관계가 약하고 Native 입력 target을
  충분히 제공하지 못한다. 별도 icon target을 키우면 header와 avatar 위에 불필요한 control 면적이 생긴다.
- Decision Outcome: header의 실제 `3:1` preview 전체와 `96×96` avatar preview 전체를 각각 하나의 Pressable로
  사용한다. 각 button 중앙에는 반투명 원형 scrim 위 흰색 camera icon을 두고 press 중에는 이미지 전체에 옅은
  veil을 표시한다. camera affordance는 장식 요소이며 별도의 focus target이 아니다. 편집 callback이 없거나
  form이 disabled/saving 상태면 preview 전체 button을 disabled로 표현한다.
- Alternatives Considered: 기존 작은 연필 button은 Native target과 이미지-동작 관계가 약해 제외했다. 우하단
  camera button은 avatar에는 익숙하지만 header와 상호작용 계약이 달라지고 이미지 일부를 가려 제외했다. 이미지
  아래 text action은 field마다 세로 공간을 늘려 제외했다.
- Consequences: Web·Android·iOS가 같은 whole-image interaction을 공유하고 별도 연필 button을 제거한다. icon은
  접근성 tree에서 숨기며 preview button 하나에 field별 label/state를 제공한다. header 비율과 avatar overlap은
  그대로 유지한다.
- Confirmation / Follow-up: component test와 Storybook에서 header 전체 button의 `3:1` geometry, avatar button의
  `96×96`, 중앙 camera affordance, pressed/disabled state와 단일 accessibility target을 검증한다.

### 상단 navigation header는 safe area를 제외하고 48px를 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`, 2026-07-29 사용자 확인
- Status: Active
- Context / Problem: compact 화면에서 상단 제목·저장 행이 불필요하게 높아지지 않으면서 Native 뒤로가기 action의
  충분한 입력 target을 확보해야 한다.
- Decision Outcome: shell이 소유하는 safe-area inset을 제외한 상단 navigation header content 높이를 정확히
  `48px`로 유지하고, 뒤로가기 action은 행 전체 높이의 `48×48` target을 사용한다.
- Alternatives Considered: Web 기준의 더 작은 공통 높이는 Native 뒤로가기 target을 줄여 제외했다. safe-area까지
  포함한 고정 `48px`은 기기별 inset을 침범하므로 제외했다.
- Consequences: Web과 Native의 header content rhythm은 같고, safe-area padding은 외부 shell이 별도로 소유한다.
- Confirmation / Follow-up: Storybook에서 content row와 뒤로가기 target이 `48px`인지 검증하고 Native 실제 safe-area
  배치는 현재 이슈·PR 완료 조건에서 제외한 뒤 Native 출시 gate에서 확인한다.

### 40 code point를 초과한 legacy 표시 이름은 변경하지 않은 경우에만 통과시킨다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-491`,
  `PROD-492`, 2026-07-29 사용자 확인
- Status: Active
- Context / Problem: presentation의 새 표시 이름 제한은 40자지만 현재 서버가 더 긴 값을 보유할 수 있어, legacy
  Profile이 bio·정책·이미지처럼 무관한 field를 편집하지 못하는 회귀가 생길 수 있다.
- Decision Outcome: 초기 displayName이 Unicode code point 기준 40을 초과하면 form에 들어온 원문과 정확히 같은
  값인 동안에만 legacy 값으로 허용한다. 새 값이나 원문에서 한 글자라도 달라진 값에는 같은 1~40 code point
  규칙을 적용한다. PROD-492 서버는
  client가 unchanged field를 생략할 것이라고 가정하지 않고 저장 원문과 입력을 비교해 같은 규칙을 적용하며,
  Remote Profile materialization의 공용 validation 계약은 변경하지 않는다.
- Alternatives Considered: 모든 40자 초과 초기값을 즉시 invalid로 만드는 방식은 무관한 field 저장을 막아 제외했다.
  UI 제한을 서버의 현행 상한까지 늘리는 방식은 승인된 40자 제품 계약을 무효화해 제외했다.
- Consequences: PROD-491은 existing-value compatibility를 presentation validation에 반영하고, PROD-492는 서버
  구현·migration 방향을 정렬한다. 사용자가 값을 변경했다가 원문과 정확히 같게 되돌리면 unchanged legacy로 본다.
- Confirmation / Follow-up: 40자 이하 경계, 40자 초과 초기값 그대로+다른 field 변경, 40자 초과 초기값 변경을
  component test와 core/API integration test에서 검증한다.

### 편집 capability는 guest-safe nullable selected Profile query로 제공한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-492`,
  2026-07-30 사용자 확인
- Status: Active
- Context / Problem: 공개 Profile route는 guest도 조회하지만 편집 button은 selected Local Owner에게만 보여야 한다.
  public role이나 `canEdit` boolean을 추가하면 권한 모델을 client에 복제하고, 일반 usingProfile auth error는 guest의
  Profile query 전체를 실패시킨다.
- Decision Outcome: nullable top-level `selectedProfileForEdit`은 selected Active/Normal Local Profile의 Owner에게만
  Profile을 반환한다. guest, session/selected Profile 부재와 편집 부적격 Account에는 오류 없이 `null`을 반환한다.
  Profile route는 반환 `id`가 표시 중인 Profile `id`와 같을 때만 편집 button을 렌더하고 disabled placeholder나
  public role/capability scalar를 만들지 않는다. mutation은 이 query 결과와 별개로 권한을 재검사한다.
- Alternatives Considered: public `canEdit`·role은 client 권한 추측과 공개 schema 확장을 만들고, protected query를
  Profile route에 합치는 방식은 guest 회귀를 만들어 제외했다.
- Consequences: 공개 Profile query의 guest 동작을 유지하면서 정상 흐름에서는 편집 button 자체가 노출되지 않는다.
- Confirmation / Follow-up: guest·Owner·Member·selected mismatch와 direct route StateView를 검증한다.

### avatar와 header는 additive Profile Media 관계와 tri-state input으로 저장한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`,
  `PROD-492`, `PROD-581`, 2026-07-30 사용자 확인
- Status: Active
- Context / Problem: Profile row의 nullable column이나 avatar/header별 table은 같은 관계 lifecycle을 중복시키고,
  update input에서 유지·교체·제거를 구분하지 못하면 부분 저장과 의도하지 않은 삭제가 생긴다.
- Decision Outcome: additive `profile_media` relation은 UUIDv7 id, Profile/Media FK, `AVATAR | HEADER` kind와 생성
  시각을 가지며 Profile마다 kind 하나만 허용하고 Media lookup index를 둔다. Profile 삭제는 relation만 cascade하며
  Media row/blob은 보존하고 기존 row backfill은 하지 않는다. update input은 field omitted=유지, concrete Media
  global ID=교체, `null`=해당 kind relation 제거다. `media_id` 전체 unique는 두지 않는다.
- Alternatives Considered: Profile nullable FK column과 kind별 table은 관계 정책·index·향후 확장을 분산시켜
  제외했다. `media_id` 전체 unique는 canonical이 허용하는 같은 Media의 avatar/header 사용을 임의로 금지해 제외했다.
- Consequences: kind별 upsert/delete가 같은 transaction에 참여하며 관계 제거가 Media 삭제를 의미하지 않는다.
- Confirmation / Follow-up: unique/upsert/delete, Profile cascade, Media 보존, omitted/ID/null을 DB/core test로 검증한다.

### Profile update는 commit 시 권한과 모든 Media를 검증한 뒤 원자적으로 반영한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-edit.md`, `PROD-492`,
  2026-07-30 사용자 확인과 독립 구현 리뷰
- Status: Superseded
- Superseded By: `Profile update는 eligibility 행을 잠그지 않고 draft만 원자적으로 반영한다`
- Context / Problem: transaction 안의 일반 SELECT 뒤 Profile id만 update하면 Profile·Membership·Account eligibility가
  commit 전에 바뀌거나 avatar/header 중 한쪽 validation 실패 전에 다른 field가 반영될 수 있다.
- Decision Outcome: service는 selected Profile, Owner Membership과 Account eligibility를 일관된 row lock 순서 또는
  동일 불변식을 보장하는 atomic guard로 재검사한다. 요청에 포함된 avatar/header global ID는 concrete Media로
  decode하고 두 Media를 모두 같은 selected Profile 소유 Local Ready인지 먼저 검증한 뒤 text·policy·relation을
  반영한다. 하나라도 실패하면 모든 field를 rollback한다. Storage byte·MIME은 재검증하지 않고 `PROD-581` 완료
  metadata를 권위로 사용한다.
- Alternatives Considered: route query 결과 재사용과 일반 SELECT 뒤 write는 TOCTOU를 닫지 못하고, field별 validation
  후 즉시 write는 partial update 위험이 있어 제외했다.
- Consequences: 권한 경쟁과 혼합 media input 실패에도 displayName·bio·policy·두 관계가 한 결과를 가진다.
- Confirmation / Follow-up: 권한 동시 변경, 한쪽 invalid Media, omitted/ID/null 혼합과 rollback을 integration test로
  검증한다.

### Profile update는 eligibility 행을 잠그지 않고 draft만 원자적으로 반영한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/design/profile-edit.md`, `PROD-492`, 2026-07-31 사용자 정정
- Status: Active
- Context / Problem: 이전 결정은 action 시작 시의 server-authoritative authorization을 commit 시점까지 보존해야
  한다고 확대 해석해 Profile뿐 아니라 공유 Instance·Account까지 직렬화했다. PROD-492 계약에는 이미 승인된 실행 중
  요청을 role·account·instance 상태 변경으로 취소해야 한다는 요구가 없다.
- Decision Outcome: `usingProfile`이 caller의 selected Profile 경계를 검증하고 service는 action 시작 시 target
  Profile, Owner Membership, Account와 Local Profile eligibility를 일반 SELECT로 다시 확인한다. 명시적인
  `FOR UPDATE`, shared lock 또는 atomic guard는 사용하지 않는다. transaction은 요청된 avatar/header Media를
  모두 먼저 검증하고 text·policy·relation draft를 원자적으로 반영하는 데만 사용한다.
- Alternatives Considered: Profile·Membership·Account·Instance의 exclusive/shared lock과 conditional atomic
  guard는 이미 승인된 요청을 취소하지 않아도 되는 benign race를 막기 위해 공유 상태를 과도하게 직렬화하므로
  제외했다.
- Consequences: 확인 직후 eligibility가 바뀌면 실행 중 update가 완료될 수 있으며 이후 요청부터 거부된다. 서로
  다른 Profile update가 공유 Instance·Account 때문에 직렬화되지 않고, Media validation 실패 시 draft 전체
  rollback은 그대로 유지된다.
- Confirmation / Follow-up: 처음부터 부적격인 Profile·Membership·Account·Instance의 거부, 한쪽 invalid Media,
  omitted/ID/null 혼합과 rollback을 integration test로 검증한다. lock 순서나 commit-time authorization 경쟁
  test는 두지 않는다.

### 공개 avatar와 header는 Profile 관계 조회가 소유한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`,
  `PROD-492`, `PROD-581`, 2026-07-30 사용자 확인
- Status: Active
- Context / Problem: owner-only Media Node loader를 그대로 사용하면 guest와 다른 Account가 공개 Profile의 이미지를
  볼 수 없고, 저장 성공 뒤 Profile로 돌아가도 변경 결과를 관찰할 수 없다.
- Decision Outcome: `Profile.avatar`와 `Profile.header` 관계 resolver가 Profile 조회 정책을 통과한 viewer에게 Ready
  Media identity와 `PROD-581`이 저장한 URL을 제공한다. media type persistence를 새 GraphQL field로 노출하지 않고
  일반 Media Node loader의 owner-only 정책도 넓히지 않는다. initial query와 mutation payload는 같은 Media id·URL을
  선택하며 `ProfileHero`가 avatar/header를 실제로 렌더링한다.
- Alternatives Considered: Media Node 전체 공개는 연결되지 않은 Ready Media까지 visibility를 넓힐 수 있어
  제외했다. 저장만 하고 공개 표시를 후속으로 미루는 방식은 PROD-492의 Profile representation 결과를 관찰할 수
  없어 제외했다.
- Consequences: Profile visibility가 공개 이미지의 authority가 되고 Relay가 저장 payload를 같은 record로 정규화한다.
- Confirmation / Follow-up: guest와 다른 Account의 공개 Profile 표시, 비공개/부적격 Profile 차단, payload/query
  identity와 ProfileHero 갱신을 검증한다.

### production image upload는 field별 draft와 명시적 retry를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-492`, `PROD-581`, 2026-07-30 사용자 확인
- Status: Active
- Context / Problem: header와 avatar upload가 독립적으로 완료될 수 있어 한쪽 실패가 다른 Ready 결과를 잃거나
  save retry가 새 Media를 만들지 않아야 한다.
- Decision Outcome: 현재 이미지가 있으면 `이미지 변경`·`이미지 삭제`·`취소` 메뉴를 표시하고 없으면 picker를
  바로 연다. route wrapper가 field별 asset, preview URI, upload generation과 Ready Media ID를 소유하고 stale
  completion을 무시한다. 실패 field에는 `다시 시도` action을 제공해 그 field의 issue→PUT→complete만 반복한다.
  upload 중·실패에는 저장을 disabled로 두고 updateProfile을 호출하지 않으며, save 실패 뒤 Ready ID를 재사용한다.
- Alternatives Considered: 실패를 preview menu에만 숨기는 방식은 복구 action 발견성이 낮고, 두 field 전체 재업로드는
  이미 Ready인 Media를 불필요하게 다시 만든다.
- Consequences: orphan cleanup은 이 범위 밖에 남지만 현재 draft와 성공한 upload를 안정적으로 재사용한다.
- Confirmation / Follow-up: 한쪽 Ready/한쪽 실패, retry, stale completion, save retry 무재업로드와 preview cleanup을
  route/component test로 검증한다.

### dirty draft는 공통 confirmation으로 보호하고 saving 중 navigation을 차단한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-492`, 2026-07-30 사용자 확인
- Status: Active
- Context / Problem: route action, Web browser back과 Android hardware back이 서로 다른 경로로 draft를 버릴 수 있고,
  saving 중 이탈은 완료된 mutation과 현재 화면의 관계를 모호하게 만든다.
- Decision Outcome: dirty navigation은 공통 confirmation으로 한 번만 가로채 `변경사항을 버릴까요?`, `계속 편집`,
  `버리기`를 제공한다. `버리기`는 원래 action을 한 번만 재실행한다. saving 중에는 navigation을 차단하고,
  성공 시 guard 해제→Relay normalization→relativeHandle Profile `router.replace` 순서를 사용하며 toast는 표시하지 않는다.
- Alternatives Considered: Web 기본 confirm은 action label을 제어할 수 없어 제외했다. saving 중 confirm 후 이탈은
  완료될 mutation을 취소할 수 없어 제외했다.
- Consequences: platform event adapter는 달라도 confirmation presentation과 상태 전이는 공유한다.
- Confirmation / Follow-up: route/Web back/Android hardware back, saving 차단과 성공 replace를 automated test와
  실제 플랫폼 QA로 구분해 확인한다.

### PROD-492 production route는 Profile Tag를 렌더링하거나 제출하지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-492`, `PROD-527`,
  2026-07-30 사용자 확인
- Status: Active
- Context / Problem: PROD-491 presentation에는 Tag editor가 있지만 PROD-492는 Tag storage·GraphQL·Relay·공개 표시를
  소유하지 않는다. UI만 숨기고 input을 보내도 후속 범위를 선행한다.
- Decision Outcome: PROD-492 production wrapper는 Tag section을 렌더링하지 않고 update input에도 Tag 값을 포함하지
  않는다. 기존 presentation과 Storybook state는 변경하지 않고 PROD-527이 재사용한다.
- Alternatives Considered: disabled Tag control은 저장 가능성 혼동을 남기고, hidden UI와 Tag input 전송은 범위를
  선행하므로 제외했다.
- Consequences: production draft 보존·retry 계약은 text·policy·image만 포함한다.
- Confirmation / Follow-up: production render와 submitted variables 모두에서 Tag가 없음을 검증한다.

### Follow Approval Policy는 현재 Profile edit draft/save가 소유하고 PROD-531에서 Settings로 이전한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`,
  `PROD-491`, `PROD-492`, `PROD-531`
- Status: Active
- Context / Problem: Settings 진입점이 아직 없어 정책 제어를 다른 화면으로 옮길 수 없고, 현재 Profile 편집에서
  표시 이름·소개·Media와 함께 사용자가 한 번에 저장할 정책 draft 경계가 필요하다.
- Decision Outcome: Profile edit는 한 줄 `팔로우 요청 자동 승인` Switch를 controlled `followPolicy` enum draft로
  제공한다. Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`로 제출하며 displayName·bio·avatar/header와 같은
  저장 callback·transaction에 포함한다. 정책 변경은 기존 Pending Follow Request의 상태나 존재를 바꾸지 않는다.
  Settings 진입점이 제공되면 `PROD-531`이 이 제어와 저장 소유권을 Settings로 이전하고 Profile edit의 중복
  제어를 제거한다.
- Alternatives Considered: Switch 변경 때 별도 즉시 저장을 실행하는 방식은 draft 전체의 원자적 저장과 실패 뒤
  재시도 경계를 깨므로 제외했다. 정책만 별도 mutation seam으로 분리하는 방식도 text·Media와 저장 소유권과
  오류 처리를 중복시켜 제외했다. Settings 이전은 현재 저장을 분리하는 근거가 아니라 `PROD-531`에서 한 번에
  소유권을 옮기는 후속 경계로 둔다.
- Consequences: `PROD-491`은 enum draft·Switch·dirty/disabled 상태와 동일 submit callback을 표현하고,
  `PROD-492`는 초기값 조회와 text·Media·policy 저장을 함께 연결한다. `PROD-531` 완료 뒤에는 Profile edit
  control과 저장 계약에서 policy를 제거한다.
- Confirmation / Follow-up: Switch 토글만으로 dirty가 되고 정확한 enum이 같은 save callback에 전달되는지,
  저장 실패 뒤 draft가 보존되는지, 정책 변경이 기존 Pending Follow Request를 바꾸지 않는지 검증한다.

### Profile Tag 제거 action은 시각 크기와 플랫폼 target을 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-491`
- Status: Active
- Context / Problem: 모든 플랫폼에 공통 `44×44` target을 적용하면 Web form의 밀도를 불필요하게 낮추면서
  Android의 `48dp` 기준에는 미달한다. 반대로 공통 `32×32`는 Native 입력 target을 충족하지 못한다.
- Decision Outcome: Profile Tag 제거 action은 시각 크기 `32×32`를 유지하고 실제 입력 target은 Web
  `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`로 제공한다. text action은 최소 높이 `36`을 사용한다.
  Profile Tag는 추가·제거만 제공하고 순서 변경 control이나 drag gesture를 제공하지 않는다.
- Alternatives Considered: 모든 플랫폼에 공통 `44×44`를 강제하는 방식과 Native target 검증을 후속으로
  미루는 방식은 플랫폼 기준과 현재 구현 계약을 동시에 충족하지 못해 제외했다.
- Consequences: 공용 component에서 compact visual과 platform별 실제 입력 target을 분리하고 제거 action의
  접근성 label/state를 유지한다.
- Confirmation / Follow-up: Storybook에서 Web `32×32 CSS px` target을 검증하고 iOS `44×44 pt`, Android
  `48×48 dp` mapping을 구현한다. Native 실제 기기 검증은 현재 이슈·PR 완료 조건에서 제외한 뒤 Native 출시
  gate에서 수행한다.

### 현재 출시와 수동 runtime QA 범위는 Web으로 한정한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/accessibility.md`, `PROD-490`, `PROD-492`,
  2026-07-31 사용자 확인
- Status: Active
- Context / Problem: 공용 React Native Profile edit 구현은 Web·Android·iOS를 지원하지만 현재 출시 대상은
  Web이다. iOS·Android 실제 기기 QA를 현재 PR 완료 조건으로 유지하면 출시 범위와 검증 gate가 어긋난다.
- Decision Outcome: 현재 출시와 수동 runtime QA 범위는 Web으로 한정한다. iOS·Android 실제 기기 QA는
  PROD-491·492와 PROD-490 통합 완료 조건에서 제외하고 Native 출시 gate에서 별도로 수행한다. 공용 React Native
  구현과 자동화 검증은 유지하되 Web 검증을 Native runtime 완료 증거로 사용하지 않는다.
- Alternatives Considered: iOS·Android 실제 기기 QA를 현재 완료 조건으로 유지하는 방식은 출시 대상이 아닌
  플랫폼 때문에 Web PR readiness를 지연하므로 제외했다. Native 검증을 완료한 것으로 간주하는 방식도 실제
  runtime 증거가 없어 제외했다.
- Consequences: PROD-492는 필수 자동화와 Web runtime 증거로 PR readiness를 판단할 수 있다. Native 출시 전에는
  safe area, Android hardware back, touch target, VoiceOver·TalkBack과 플랫폼별 picker/upload 동작을 별도 gate에서
  검증해야 한다.
- Confirmation / Follow-up: PROD-492 PR에 Web 수동 검증과 iOS·Android 미실행·명시적 제외를 함께 기록하고,
  Native 출시 작업에서 실제 기기 QA를 다시 연다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
