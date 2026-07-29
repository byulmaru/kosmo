## 1. PROD-491 Profile edit presentation과 상태 카탈로그

**Authority / Provenance**

- `docs/design/profile-edit.md`
- `docs/design/profile-tags.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `PROD-490`
- `PROD-491`

**Deliverable**

route·GraphQL 없이 displayName, bio, `followPolicy` enum draft와 한 줄 `팔로우 요청 자동 승인` Switch,
avatar/header controlled state와 Profile Tag 로컬 편집을 표현하는 React Native 공용 Profile edit component와 현재
Web Storybook 상태 카탈로그를 전달한다. Native route 연결과 실제 기기 검증은 PROD-492 전달 시 수행한다.

**Guardrails**

- route, selected Owner query, Relay mutation, Media picker/upload, navigation과 persistence를 추가하지 않는다.
- optional submit callback이 없으면 저장을 disabled로 표현하고 success를 가장하지 않는다.
- Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`로 해석하고 다른 Profile draft와 같은 submit callback에
  포함한다. 별도 즉시 저장이나 별도 mutation seam을 만들지 않는다.
- 현재 avatar/header를 초기 draft로 사용하고 공통 `유지` action row를 두지 않는다. 각 이미지의 편집 control은
  해당 field만 변경하며 초기값과 같은 draft에서는 저장을 disabled로 표현한다.
- inline TagChip 추가·제거를 제공하되 Tag 저장·Relay는 연결하지 않는다. 개수 상한·순서
  변경 UI·gesture는 추가하지 않는다.
- Profile Link와 기존 Figma 시안의 범위 밖 field를 포함하지 않는다.
- 기존 theme token·breakpoint와 React Native primitive를 사용한다. Profile Tag 제거 action은 시각 크기
  `32×32`, 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`를 제공하고 text
  action은 최소 높이 `36`과 accessibility state를 유지한다.
- header 이미지 preview는 hero wrapper와 분리하고 모든 지원 폭에서 `3:1`과 중앙 기준 cover crop을 유지한다.

**Verification**

- 기본·dirty·displayName/bio 경계·Tag 추가/제거/임의 개수/invalid/duplicate를 component test와
  Storybook에서 확인한다. 순서 변경 control이 없음도 확인한다.
- `팔로우 요청 자동 승인` Switch의 초기 enum 매핑, 토글 dirty, callback `OPEN`/`APPROVAL_REQUIRED` 제출과
  callback 없음/unchanged disabled, saving 중 재토글 방지를 확인한다.
- avatar/header 각각의 교체·제거·upload-wait·error, saving·failure·retry controlled state와 이미지 오류의
  `<label> 이미지 업로드에 실패했어요. 다시 시도해 주세요.` 안내를 검증한다.
- 한 이미지 field만 편집할 때 다른 이미지의 현재 draft가 유지되고 공통 `유지` action row가 없는지 확인한다.
- `390×130`, `600×200`과 중간 폭에서 header preview가 `3:1`이며 wrapper·avatar·action이 비율을
  왜곡하지 않는지 검증한다.
- Web 390·1024·1440 wrapping과 Profile Tag 제거 action의 `32×32 CSS px` target을 확인한다.
- Native 실제 기기의 safe area·layout과 Profile Tag 제거 action의 iOS `44×44 pt`, Android `48×48 dp`
  target은 PROD-492 전달 시 확인한다.
- 테스트 코드 범위는 Profile edit form/editor의 승인 동작을 직접 검증하는 최소 component test로 제한하고 중복
  snapshot·새 harness·관련 없는 fixture 확대는 제외한다.

- [x] 1.1 route-independent Profile edit screen/form과 displayName·bio controlled 입력·validation을 구현한다.
- [x] 1.2 현재 값을 초기 draft로 사용하는 avatar/header별 controlled 편집 state, `3:1` header preview와 callback
      seam을 구현한다.
- [x] 1.3 Profile Tag inline chip editor의 로컬 추가·제거·validation을 구현한다.
- [x] 1.4 unchanged/callback 없음의 disabled submit과 `followPolicy` Switch의 dirty·disabled·saving·failure·retry
      상태를 포함한 상태 카탈로그, 접근성 metadata를 추가한다.
- [x] 1.5 `followPolicy` Switch의 초기 enum 매핑과 `OPEN`/`APPROVAL_REQUIRED` 제출, dirty·disabled·saving·failure·retry
      동작을 최소 component test와 Storybook 상태·a11y/static build로 검증하고 app 필수 check를 통과해 PROD-491
      PR에 증거를 기록한다.

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
avatar/header·`followPolicy` 저장, Relay·navigation에 연결한다.

**Guardrails**

- selectedProfileId나 Local origin을 client-side Owner 권한으로 사용하지 않는다.
- 같은 Profile의 Ready Local Media만 avatar/header로 연결하고 관계 제거 때 Media를 삭제하지 않는다.
- `followPolicy`는 displayName·bio·Media 관계와 같은 draft/save 경계에서 저장하고, 별도 즉시 저장이나 별도
  mutation seam을 만들지 않는다. 정책 변경은 기존 Pending Follow Request를 바꾸지 않는다.
- Tag API가 연결되기 전에는 production에서 저장 가능한 Tag control을 노출하지 않는다.
- displayName·bio·`followPolicy`와 Media 관계를 부분 저장하지 않고 실패 뒤 draft를 보존한다.

**Verification**

- Owner·Member·무관 Account, Local/Remote·inactive/suspended Profile과 직접 route 진입을 API·route test로 검증한다.
- displayName 1~40, bio 500, Ready/Uploading/Failed·다른 Profile Media와 교체·제거·rollback을 통합 test로 확인한다.
- `followPolicy` 초기값과 `OPEN`/`APPROVAL_REQUIRED` enum 매핑, text·Media와의 동일 저장 경계, 기존 Pending
  Follow Request 불변을 통합 test로 확인한다.
- Relay 성공·실패·retry, production entrypoint와 Profile 복귀를 Web·Android·iOS에서 확인한다.
- 테스트 코드 범위는 authorization, text/Media 저장 원자성과 route 연결을 직접 검증하는 기존 API/app test에
  한정하고 Media upload 인프라·Profile Tag·Settings coverage 확대는 제외한다.

- [ ] 2.1 selected Active/Normal Local Profile Owner capability/query와 거부 경계를 구현한다.
- [ ] 2.2 update service/input을 selected Profile 기준 displayName·bio와 avatar/header 관계로 정렬하고 통합 test를 추가한다.
- [ ] 2.3 protected route에 초기값, submit, picker/upload 결과와 Relay mutation을 연결한다.
- [ ] 2.4 성공 navigation, failure draft·retry와 production entrypoint를 연결하고 route/component test를 추가한다.
- [ ] 2.5 core·API·app·Web 필수 검증을 통과하고 PROD-492 PR에 권한·Media·Relay 증거를 기록한다.

## 3. PROD-490 통합 검증과 OpenSpec archive

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

- Owner route 진입→초기값→text/Media save→Relay 갱신→Profile 복귀와 권한·validation·upload·save 실패 복구를
  통합 환경에서 검증한다.
- API 미연결 route와 enabled but unsaved Tag control이 노출되지 않음을 확인하고, 연결된 Profile edit route에서
  followPolicy Switch가 enum과 동일 저장 경계로 제공되는지 확인한다.
- archive 전후 strict validation과 delta spec 동기화를 확인한다.

- [ ] 3.1 PROD-491·492 완료 조건, PR, 필수 test와 unresolved review thread를 확인한다.
- [ ] 3.2 Owner 성공과 Member/무관 Account·invalid text/Media·upload/save 실패 복구를 종단 간 검증한다.
- [ ] 3.3 Profile Tag 저장·공개 표시와 Settings 이전은 제외 범위로 유지하고, 현재 followPolicy 저장 경계·기존
      Pending Follow Request 불변과 Profile Link 제외 범위·기존 Profile 조회 회귀를 확인한다.
- [ ] 3.4 canonical·Linear·OpenSpec 정합성과 strict validation을 확인한다.
- [ ] 3.5 모든 task와 통합 gate 완료 뒤 change를 archive하고 archive 후 validation·Linear 상태를 확인한다.
