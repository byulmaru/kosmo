## 1. PROD-491 Profile edit presentation과 상태 카탈로그

**Authority / Provenance**

- `docs/design/profile-edit.md`
- `docs/design/profile-tags.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `PROD-490`
- `PROD-491`

**Deliverable**

route·GraphQL 없이 displayName, bio, avatar/header controlled state와 Profile Tag 로컬 편집을 표현하는 universal
Profile edit component와 Web·Android·iOS 상태 카탈로그를 전달한다.

**Guardrails**

- route, selected Owner query, Relay mutation, Media picker/upload, navigation과 persistence를 추가하지 않는다.
- optional submit callback이 없으면 저장을 disabled로 표현하고 success를 가장하지 않는다.
- 현재 avatar/header를 초기 draft로 사용하고 공통 `유지` action row를 두지 않는다. 각 이미지의 편집 control은
  해당 field만 변경하며 초기값과 같은 draft에서는 저장을 disabled로 표현한다.
- inline TagChip 추가·제거와 같은 영역의 명시적 순서 변경 mode를 제공하되 Tag 저장·Relay는 연결하지 않는다.
- Follow Approval Policy, Profile Link와 기존 Figma 시안의 범위 밖 field를 포함하지 않는다.
- 기존 theme token·breakpoint와 React Native primitive를 사용하고 44×44 target과 accessibility state를 유지한다.
- header 이미지 preview는 hero wrapper와 분리하고 모든 지원 폭에서 `3:1`과 중앙 기준 cover crop을 유지한다.

**Verification**

- 기본·dirty·displayName/bio 경계·Tag 추가/제거/순서/최대/invalid/duplicate를 component test와 Storybook에서 확인한다.
- avatar/header 각각의 교체·제거·upload-wait·error, saving·success·failure·retry controlled state를 검증한다.
- 한 이미지 field만 편집할 때 다른 이미지의 현재 draft가 유지되고 공통 `유지` action row가 없는지 확인한다.
- `390×130`, `600×200`과 중간 폭에서 header preview가 `3:1`이며 wrapper·avatar·action이 비율을
  왜곡하지 않는지 검증한다.
- mobile·1024·1440 wrapping, keyboard·screen-reader 이동과 action target을 확인한다.
- 테스트 코드 범위는 Profile edit form/editor의 승인 동작을 직접 검증하는 최소 component test로 제한하고 중복
  snapshot·새 harness·관련 없는 fixture 확대는 제외한다.

- [x] 1.1 route-independent Profile edit screen/form과 displayName·bio controlled 입력·validation을 구현한다.
- [x] 1.2 현재 값을 초기 draft로 사용하는 avatar/header별 controlled 편집 state, `3:1` header preview와 callback
      seam을 구현한다.
- [ ] 1.3 Profile Tag inline chip editor, 로컬 validation과 명시적 순서 변경 mode를 구현한다.
- [ ] 1.4 unchanged/callback 없음의 disabled submit과 dirty·upload·saving·success·failure·retry 상태 카탈로그,
      접근성 metadata를 추가한다.
- [ ] 1.5 최소 component test, Storybook a11y/static build와 app 필수 check를 통과하고 PROD-491 PR에 증거를 기록한다.

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
avatar/header 저장, Relay·navigation에 연결한다.

**Guardrails**

- selectedProfileId나 Local origin을 client-side Owner 권한으로 사용하지 않는다.
- 같은 Profile의 Ready Local Media만 avatar/header로 연결하고 관계 제거 때 Media를 삭제하지 않는다.
- Follow Approval Policy와 Profile Tag 저장·Relay를 포함하지 않는다.
- Tag API가 연결되기 전에는 production에서 저장 가능한 Tag control을 노출하지 않는다.
- displayName·bio와 Media 관계를 부분 저장하지 않고 실패 뒤 draft를 보존한다.

**Verification**

- Owner·Member·무관 Account, Local/Remote·inactive/suspended Profile과 직접 route 진입을 API·route test로 검증한다.
- displayName 1~40, bio 500, Ready/Uploading/Failed·다른 Profile Media와 교체·제거·rollback을 통합 test로 확인한다.
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
- Profile Tag 저장·공개 표시와 Follow Approval Policy Settings 완료를 이 change의 완료 조건으로 만들지 않는다.
- PR readiness와 OpenSpec archive를 분리하고 구현에서 계약 불일치가 발견되면 canonical·Linear부터 갱신한다.

**Verification**

- Owner route 진입→초기값→text/Media save→Relay 갱신→Profile 복귀와 권한·validation·upload·save 실패 복구를
  통합 환경에서 검증한다.
- API 미연결 route, enabled but unsaved Tag control과 followPolicy field가 노출되지 않음을 확인한다.
- archive 전후 strict validation과 delta spec 동기화를 확인한다.

- [ ] 3.1 PROD-491·492 완료 조건, PR, 필수 test와 unresolved review thread를 확인한다.
- [ ] 3.2 Owner 성공과 Member/무관 Account·invalid text/Media·upload/save 실패 복구를 종단 간 검증한다.
- [ ] 3.3 Profile Tag·followPolicy·Profile Link 제외 범위와 기존 Profile 조회 회귀를 확인한다.
- [ ] 3.4 canonical·Linear·OpenSpec 정합성과 strict validation을 확인한다.
- [ ] 3.5 모든 task와 통합 gate 완료 뒤 change를 archive하고 archive 후 validation·Linear 상태를 확인한다.
