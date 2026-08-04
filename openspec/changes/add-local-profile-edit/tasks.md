## 1. PROD-491 Profile edit presentation과 상태 카탈로그

**Authority / Provenance**

- `docs/design/profile-edit.md`
- `docs/design/profile-tags.md`
- `docs/domain/objects/hashtag.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `PROD-490`
- `PROD-491`
- `PROD-526`

**Deliverable**

route·GraphQL 없이 displayName, bio, `followPolicy` enum draft와 한 줄 `팔로우 요청 자동 승인` Switch,
avatar/header controlled state와 Profile Tag 로컬 편집을 표현하는 React Native 공용 Profile edit component와 현재
Web Storybook 상태 카탈로그를 전달한다. Native route 연결과 자동화 검증은 PROD-492 공용 구현에 포함한다. Native
실제 기기 QA는 아직 실행하지 않았고 현재 Web 완료 증거에 포함하지 않는다.

**Guardrails**

- route, selected Owner query, Relay mutation, Media picker/upload, navigation과 persistence를 추가하지 않는다.
- optional submit callback이 없으면 저장을 disabled로 표현하고 success를 가장하지 않는다.
- Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`로 해석하고 다른 Profile draft와 같은 submit callback에
  포함한다. 별도 즉시 저장이나 별도 mutation seam을 만들지 않는다.
- 현재 avatar/header를 초기 draft로 사용하고 공통 `유지` action row를 두지 않는다. 각 이미지의 편집 control은
  해당 field만 변경하며 초기값과 같은 draft에서는 저장을 disabled로 표현한다. header `3:1` preview 전체와
  `96×96` avatar preview 전체를 각각 단일 편집 button으로 사용하고 별도의 연필 button을 두지 않는다.
- 상단 navigation header는 safe-area를 제외한 content 높이 `48px`, 뒤로가기 action은 `48×48`로 유지한다.
- 새로 입력하거나 변경한 displayName에는 Unicode code point 기준 1~40 validation을 적용한다. 40 code point를
  초과하는 legacy 초기값은 form에
  들어온 원문과 정확히 같은 경우에만 다른 field 저장을 막지 않는다.
- inline TagChip 추가·제거를 제공하되 Tag 저장·Relay는 연결하지 않는다. 개수 상한·순서
  변경 UI·gesture는 추가하지 않는다.
- Profile Tag canonical identity는 Hashtag의 NFKC·locale 비종속 `toLowerCase()` 규칙으로 비교하고,
  chip은 최초 입력의 NFKC 표기를 유지한다.
- Profile Link와 기존 Figma 시안의 범위 밖 field를 포함하지 않는다.
- 기존 theme token·breakpoint와 React Native primitive를 사용한다. Profile Tag 제거 action은 시각 크기
  `32×32`, 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`를 제공하고 text
  action은 최소 높이 `36`과 accessibility state를 유지한다.
- header 이미지 preview는 hero wrapper와 분리하고 모든 지원 폭에서 `3:1`과 중앙 기준 cover crop을 유지한다.

**Verification**

- 기본·dirty·displayName/bio 경계·Tag 추가/제거/임의 개수/invalid/canonical identity duplicate와 최초 입력
  NFKC 표기 보존을 공용 parity fixture, component test와 Storybook에서 확인한다. 순서 변경 control이 없음도 확인한다.
- `팔로우 요청 자동 승인` Switch의 초기 enum 매핑, 토글 dirty, callback `OPEN`/`APPROVAL_REQUIRED` 제출과
  callback 없음/unchanged disabled, saving 중 재토글 방지를 확인한다.
- avatar/header 각각의 교체·제거·upload-wait·error, saving·failure·retry controlled state와 이미지 오류의
  `<label> 이미지 업로드에 실패했어요. 다시 시도해 주세요.` 안내를 검증한다.
- caller가 제공한 임의 오류 detail 대신 canonical 이미지 오류 문구만 표시하는지 확인한다.
- 한 이미지 field만 편집할 때 다른 이미지의 현재 draft가 유지되고 공통 `유지` action row가 없는지 확인한다.
- header·avatar preview 전체가 각각 단일 button이고 중앙 camera affordance, pressed veil, disabled/accessibility
  state를 제공하며 별도 연필 button이나 중첩 focus target이 없는지 확인한다.
- `390×130`, `600×200`과 중간 폭에서 header preview가 `3:1`이며 wrapper·avatar·action이 비율을
  왜곡하지 않는지 검증한다.
- Web 390·1024·1440 wrapping, 상단 navigation header·뒤로가기 action의 `48px` geometry와 Profile Tag 제거
  action의 `32×32 CSS px` target을 확인한다.
- displayName 40자 경계, 40자 초과 legacy 초기값 그대로+다른 field 변경, 40자 초과 초기값 변경 거부를 확인한다.
- Native safe area·layout과 Profile Tag 제거 action의 iOS `44×44 pt`, Android `48×48 dp` mapping은 공용 구현과
  자동화로 유지한다. Native 실제 기기 QA는 아직 실행하지 않았고 현재 Web 완료 증거에 포함하지 않는다.
- 테스트 코드 범위는 Profile edit form/editor의 승인 동작을 직접 검증하는 최소 component test로 제한하고 중복
  snapshot·새 harness·관련 없는 fixture 확대는 제외한다.

- [x] 1.1 route-independent Profile edit screen/form과 displayName·bio controlled 입력·validation을 구현한다.
- [x] 1.2 현재 값을 초기 draft로 사용하는 avatar/header별 controlled 편집 state, `3:1` header preview와 callback
      seam을 구현한다.
- [x] 1.3 Profile Tag inline chip editor의 로컬 추가·제거·validation을 구현한다.
- [x] 1.4 unchanged/callback 없음의 disabled submit과 `followPolicy` Switch의 dirty·disabled·saving·failure·retry
      상태를 포함한 상태 카탈로그, 접근성 metadata를 추가한다.
- [x] 1.5 `followPolicy` Switch의 두 enum 초기 표시와 `OPEN`/`APPROVAL_REQUIRED` 양방향 제출, dirty·disabled·saving·failure·retry
      동작을 최소 component test와 Storybook 상태·a11y/static build로 검증하고 app 필수 check를 통과해 PROD-491
      PR에 증거를 기록한다.
- [x] 1.6 header·avatar preview 전체 button, 중앙 camera affordance·pressed veil, `48px` 상단 navigation header와
      canonical 이미지 오류 문구를 구현하고 component test·Storybook에서 geometry·disabled·접근성 상태를 검증한다.
- [x] 1.7 40 code point를 초과하는 legacy displayName의 unchanged 호환 경계와 변경 시 Unicode code point 기준
      1~40 validation을 구현하고 경계
      component test를 추가한다.

## 2. PROD-492 selected Owner route·API·Media 연결

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/design/profile-edit.md`
- `PROD-490`
- `PROD-492`

**Deliverable**

PROD-491 presentation을 server-authoritative selected Local Owner query/capability, protected route, displayName·bio와
avatar/header·`followPolicy` 저장, viewer-authorized Profile image read, ProfileHero, Relay·navigation에 연결한다.
이 구현은 `PROD-581`의 Local Media 완료 URL·media type metadata 위에 쌓는다.

**Guardrails**

- nullable `selectedProfileForEdit`은 Owner에게만 selected Profile을 반환하고 guest·부적격 Account에는 오류 없이
  `null`을 반환한다. 공개 role/`canEdit` scalar나 client-side Owner 추측을 만들지 않는다.
- `profile_media`는 additive 관계 table로 두고 기존 Profile을 backfill하지 않는다. Profile 삭제는 관계만
  cascade하고 Media는 보존하며 `media_id` 전체 unique를 두지 않는다.
- update input은 avatar/header omitted=유지, concrete Media global ID=교체, `null`=관계 제거로 해석한다.
- action 시작 시 selected Profile·Owner Membership·Account eligibility를 server-authoritative하게 재검증하되
  명시적인 lock이나 atomic guard는 사용하지 않고, 요청된 모든 Media를 먼저 검증한 뒤 전체 draft를 반영한다.
- 같은 selected Profile의 Ready Local Media만 avatar/header로 연결하고 관계 제거 때 Media를 삭제하지 않는다.
  Storage byte·MIME은 다시 검증하지 않고 `PROD-581` metadata를 소비한다.
- `followPolicy`는 displayName·bio·Media 관계와 같은 draft/save 경계에서 저장하고, 별도 즉시 저장이나 별도
  mutation seam을 만들지 않는다. 정책 변경은 기존 Pending Follow Request를 바꾸지 않는다.
- legacy displayName은 저장 원문과 같으면 허용하고 달라진 값만 Unicode code point 기준 1~40으로 서버 검증한다.
  bio는 앞뒤 공백을 제거한 뒤 500자 이하로 검증한다. Remote Profile 공용
  validation을 변경하지 않는다.
- Profile avatar/header public read는 Profile visibility와 관계 resolver가 소유하고 일반 Media Node owner-only
  정책을 넓히지 않는다. ProfileHero가 실제 이미지를 표시해야 한다.
- production에서는 Tag control을 렌더링하거나 update input에 포함하지 않는다.
- field별 upload generation과 Ready ID를 보존하고 실패 field만 명시적으로 재시도한다. saving 중 navigation을
  차단하고 dirty 이탈은 승인된 공통 confirmation 문구와 action으로 보호한다.
- displayName·bio·`followPolicy`와 Media 관계를 부분 저장하지 않고 실패 뒤 draft를 보존한다.

**Verification**

- Owner·Member·무관 Account·guest, Local/Remote·inactive/suspended Profile, selected mismatch와 direct route
  StateView를 API·route test로 검증한다.
- Profile/Membership/Account가 처음부터 부적격이면 전체 update를 거부하고, action 시작 뒤 eligibility 변경은
  실행 중 요청을 취소하지 않으며 이후 요청부터 거부하는지 확인한다.
- 새로 입력·변경한 displayName Unicode code point 1~40과 astral 문자 경계, 40 code point 초과 legacy 초기값
  그대로+다른 field 변경, legacy 초기값 변경 거부, 앞뒤 공백 제거 후 bio 500 경계, omitted/ID/null,
  Ready/Uploading·다른 Profile Media와 교체·제거·한쪽 invalid rollback을 통합 test로 확인한다. upload 실패는
  영속 Media State가 아니라 client upload/retry 검증에서 확인한다.
- relation unique/upsert/delete, Profile cascade와 Media row 보존, guest/다른 Account의 공개 avatar/header read,
  standalone Media visibility 불변을 확인한다.
- `followPolicy` 초기값과 `OPEN`/`APPROVAL_REQUIRED` enum 매핑, text·Media와의 동일 저장 경계, 기존 Pending
  Follow Request 불변을 통합 test로 확인한다.
- Relay 동일 Media identity, ProfileHero 갱신, 한쪽 upload 실패/다른 쪽 Ready, field retry, save retry의 Ready ID
  재사용, stale completion과 preview cleanup을 확인한다.
- route/Web back/Android hardware back discard, saving 차단, 성공 guard 해제→normalize→replace를 확인한다.
- Web 실제 runtime QA는 자동화 통과와 별도 증거로 기록한다. iOS·Android 실제 기기 QA는 아직 실행하지 않았고
  현재 Web 완료 증거에 포함하지 않으며, 실행하지 않은 플랫폼을 통과로 적지 않는다.
- 테스트 코드 범위: `profile_media` DB/core service, Profile GraphQL query/mutation integration, Profile route와
  upload/navigation/Relay를 직접 검증하는 기존 API/app test surface.
- 테스트 필요성: 초기 부적격 권한 거부, tri-state 관계 원자성, 공개 Profile read, 부분 upload 실패와 navigation race가
  부분 저장·정보 비공개 회귀·중복 upload를 만들지 않음을 관찰 가능한 결과로 증명한다.
- 테스트 제외 범위: Media upload 인프라 자체, orphan cleanup, Profile Tag·Settings, crop·thumbnail·variant·Remote
  Media·Fedify, 관련 없는 coverage·snapshot·새 범용 test harness 확대.

- [x] 2.1 `profile_media` enum/table, FK·unique·index와 relation을 additive migration으로 추가하고 DB 제약·cascade·
      Media 보존을 검증한다.
- [x] 2.2 guest-safe nullable `selectedProfileForEdit`, action 시작 시 Profile/Membership/Account authorization과
      거부 경계를 구현하고 초기 부적격 상태 integration test를 추가한다.
- [x] 2.3 update input/service를 selected Profile 기준 text·`followPolicy`·avatar/header omitted/ID/null로 정렬하고
      legacy displayName, Media 선검증·원자 rollback integration test를 추가한다.
- [x] 2.4 Profile avatar/header viewer-authorized resolver와 mutation/query payload identity를 연결하고 공개 조회,
      기존 Media Node visibility와 ProfileHero 표시 test를 추가한다.
- [x] 2.5 protected route에 초기값과 production entrypoint를 연결하고 id-match edit button, direct-access StateView,
      Profile Tag UI/input 제외를 route test로 검증한다.
- [x] 2.6 picker와 issue→PUT→complete를 field별 draft에 연결하고 변경·삭제·취소/direct picker, stale completion,
      명시적 field retry와 save retry Ready ID 재사용을 검증한다.
- [x] 2.7 dirty route/Web/Android back confirmation, saving navigation 차단과 성공 guard 해제→Relay normalize→
      relativeHandle Profile replace를 구현하고 route test를 추가한다.
- [x] 2.8 core·API·app·Web 필수 검증을 통과하고 실제 Web QA 증거와 iOS·Android 실제 기기 QA의 미실행 상태를
      구분해 PROD-492 PR에 권한·Media·Relay·navigation 증거와 현재 Web 완료에 포함하지 않는 Native QA 상태를
      기록한다.

## 3. PROD-613 post-commit 응답·Relay·navigation 회귀 수정

**Authority / Provenance**

- `docs/design/profile-edit.md`
- `PROD-490`
- `PROD-613`

**Deliverable**

Web `router.replace` callback return 직후 navigation permission을 회수해 실제 비동기 REPLACE를 다시 차단하는
race를 수정한다. 정상 저장은 실제 Profile route commit으로 끝나고, navigation no-op/실패도 영구 `saving`
대신 복구 가능한 terminal 상태로 수렴한다. 현재 draft와 Ready avatar/header Media ID를 보존하며 mutation
자동 재전송이나 이미지 자동 재업로드를 실행하지 않는다.

**Guardrails**

- API/BFF/Relay response는 확인된 정상 경계다. timeout·buffering 변경으로 client navigation race를 우회하지 않는다.
- 정상 성공은 Relay normalization으로 저장 draft를 clean baseline에 맞추고 `saving`을 끝낸 render에서
  `relativeHandle` Profile route REPLACE를 one-shot으로 실행한다. clean baseline이 유지되는 동안에는 늦은
  `beforeRemove`를 다시 막지 않는다.
- callback return을 navigation 완료로 간주하지 않는다. 실제 commit 전 새 draft가 생기면 그 입력 보호가
  성공 REPLACE보다 우선하며 기존 discard confirmation의 one-shot 보호를 다시 활성화한다.
- 저장 복구는 Ready Media ID를 재사용하며 자동 mutation 재전송이나 이미지 재업로드를 실행하지 않는다.
- 범용 GraphQL tracing·timeout·streaming 변경, Media Storage Service 성능·이미지 압축/resize, Profile Tag와
  Native 실제 기기 QA로 범위를 넓히지 않는다. 확인된 원인이 별도 행동 계약이나 공통 인프라 변경을 요구하면
  구현 전에 canonical 문서와 Linear 범위를 먼저 갱신한다.
- PROD-613은 원인·수정·회귀 테스트와 Web runtime 증거만 소유한다. 전체 Profile edit 통합 검증과
  `add-local-profile-edit` archive는 PROD-490에 남긴다.
- root cause와 수정 계약은 확정됐지만 이 task 문서 갱신은 구현 승인이 아니다.

**Verification**

- 조사 단계에서 text-only와 Ready avatar/header ID 저장의 API/BFF body·browser parse·Relay callback 종료 뒤
  guard effect와 `router.replace` return 이후 실제 route commit만 실패하는 correlation을 기록했다. 최종 회귀
  검증은 production 계측 없이 mutation 응답과 최종 URL·route 결과를 assertion한다.
- 즉시 permission 회수를 제거한 fault injection에서 동일 E2E가 통과한 증거를 유지하고, 구현 후에는 실제
  Chromium의 비동기 `beforeRemove` ordering으로 성공을 검증한다. route test는 clean baseline에서 늦은
  `beforeRemove`가 통과하는 순서와 commit 전 새 draft가 생겨 pending REPLACE를 다시 가로채는 순서를 구분한다.
- 저장 결과가 불확실하거나 실패해도 현재 text·policy·Ready Media ID가 유지되고 save retry에서
  issue→PUT→complete를 다시 실행하지 않는지 확인한다.
- 기존 dirty navigation guard, Relay normalized Profile 갱신, avatar/header omitted/ID/null과 validation이
  회귀하지 않는지 관련 app·API·BFF·core test로 확인한다.
- Web dev 환경에서 실제 저장을 재검증하고 원인, 수정 경계, 자동화 결과와 Native 실제 기기 QA 미실행을
  현재 Web 완료 증거에 포함하지 않는 상태로 PROD-613 PR에 기록한다.

- [x] 3.1 조사 단계 임시 correlation 계측으로 text-only와 Ready avatar/header ID 저장을 재현해 최초 정지
      경계가 `router.replace` callback return 뒤 실제 Web route commit임을 PROD-613에 기록하고 계측 코드를 제거한다.
- [x] 3.2 실제 Chromium E2E에서 수정 전 영구 `saving`을 재현하고, guard의 즉시 permission 회수 한 줄만 제거한
      fault injection으로 동일 시나리오가 통과함을 입증한다. 실험 코드는 원상복구한다.
- [x] 3.3 성공 저장을 clean terminal state로 수렴시키고 clean baseline에서 one-shot REPLACE를 실행하며, commit 전
      새 draft가 생기면 그 입력 보호를 우선하도록 Profile edit navigation lifecycle만 수정한다. draft·Ready Media
      ID 보존과 자동 재전송·재업로드 금지를 유지한다.
- [x] 3.4 text-only·Ready Media ID 성공, 비동기 `beforeRemove`, commit 전 새 draft, navigation no-op/실패,
      GraphQL/transport 실패를 자동화하고 dirty discard guard·Relay normalization·Ready ID 무재업로드 회귀를 함께
      검증한다.
- [x] 3.5 관련 app·API·BFF·core 필수 검증과 Web dev runtime QA를 완료하고 원인·수정·남은 위험을 기록한 뒤
      PROD-490 통합 검증 담당자에게 evidence를 전달한다.

## 4. PROD-548 공용 IconButton과 Profile edit action 정렬

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/profile-edit.md`
- `docs/design/profile-tags.md`
- `PROD-548`

**Deliverable**

플랫폼별 최소 입력 target, 접근성 button semantics와 pressed·disabled 상태를 소유하는 React Native 공용
`IconButton`을 추가하고 Profile edit의 뒤로가기, avatar/header 이미지 편집, Profile Tag 제거 action에 적용한다.

**Guardrails**

- 기존 시각 크기와 배치를 유지하면서 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp` 최소 입력
  target mapping을 공용 구현으로 중앙화한다.
- header/avatar preview 전체를 각각 하나의 button으로 유지하고 camera affordance를 별도 focus target으로 만들지 않는다.
- Profile edit의 저장·Media·navigation 동작, 다른 화면의 icon action과 공용 Button 계약을 변경하지 않는다.
- 현재 완료 조건은 Web component test와 Web runtime 검증이다. iOS·Android mapping은 공용 구현과 자동화로
  유지하되 실제 기기·simulator runtime QA는 Native 출시 gate에서 수행한다.

**Verification**

- 공용 component test에서 플랫폼별 target mapping, 필수 accessibility label, disabled state와 시각 크기·입력
  target 분리를 검증한다.
- Profile edit Storybook에서 뒤로가기와 이미지 편집 preview, Profile Tag 제거 action이 단일 button semantics,
  기존 geometry, overlap·clipping 없는 배치를 유지하는지 확인한다.
- app 단위 test, TypeScript, Storybook build·interaction과 Web runtime을 통과하고 Native runtime 미실행을 PR에 기록한다.

- [x] 4.1 공용 `IconButton`을 component test로 정의하고 Profile edit 뒤로가기·이미지 편집·Profile Tag 제거 action을
      교체해 플랫폼별 target mapping과 기존 single-focus·geometry를 유지한다.
- [ ] 4.2 app 필수 자동화와 Web runtime을 검증하고 독립 구현 리뷰를 통과한 뒤 PROD-548 PR에 증거와 Native 실제
      기기·simulator runtime QA 제외를 기록한다.

## 5. PROD-490 통합 검증과 OpenSpec archive

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/design/profile-edit.md`
- `PROD-490`
- `PROD-491`
- `PROD-492`

**Deliverable**

두 구현 slice가 권한 있는 Local Profile Owner에게 하나의 안전한 Profile edit 결과를 제공함을 검증하고,
canonical·Linear·구현·OpenSpec이 일치할 때 `add-local-profile-edit`을 archive한다.

**Guardrails**

- PROD-491·492와 각 검증이 완료되기 전에는 부모 완료나 archive를 처리하지 않는다.
- Profile Tag 저장·공개 표시와 Settings 진입점 제공 뒤의 Follow Approval Policy 이전 완료를 이 change의 완료
  조건으로 만들지 않는다.
- PR readiness와 OpenSpec archive를 분리하고 구현에서 계약 불일치가 발견되면 canonical·Linear부터 갱신한다.

**Verification**

- Owner route 진입→초기값→text/Media save→Relay·ProfileHero 갱신→Profile 복귀와 권한·validation·부분 upload·
  save 실패 복구를 통합 환경에서 검증한다.
- API 미연결 route와 enabled but unsaved Tag control이 노출되지 않음을 확인하고, 연결된 Profile edit route에서
  followPolicy Switch가 enum과 동일 저장 경계로 제공되는지 확인한다.
- archive 전후 strict validation과 delta spec 동기화를 확인한다.

- [ ] 5.1 PROD-491·492·613·548 완료 조건, PR, 필수 test와 unresolved review thread를 확인한다.
- [ ] 5.2 Owner 성공과 guest/Member/무관 Account·invalid text/Media·upload/save 실패·post-commit 응답 이상·
      dirty navigation 복구를
      종단 간 검증한다.
- [ ] 5.3 Profile Tag 저장·공개 표시와 Settings 이전은 제외 범위로 유지하고, 현재 followPolicy 저장 경계·기존
      Pending Follow Request 불변과 Profile Link 제외 범위·기존 Profile 조회 회귀를 확인한다.
- [ ] 5.4 canonical·Linear·OpenSpec 정합성과 strict validation을 확인한다.
- [ ] 5.5 모든 task와 통합 gate 완료 뒤 change를 archive하고 archive 후 validation·Linear 상태를 확인한다.
