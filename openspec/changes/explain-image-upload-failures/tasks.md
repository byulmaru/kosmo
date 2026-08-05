## 1. PROD-657 공통 업로드 오류 계약

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/design/media-upload-errors.md`
- `PROD-657`

**Deliverable**

앱이 이미지 업로드의 발급·byte 전송·완료 확인 실패를 구분하고, signed PUT의 허용된 status/code 조합만
원인별 안전한 한국어 안내로 변환한다.

**Guardrails**

- status와 code allowlist가 함께 일치할 때만 구체 원인으로 분류하고 network·`5xx`·malformed·unknown은
  transient로 폴백한다.
- Storage Service의 message, raw body, URL, header와 내부 식별자를 UI 오류 상태·문구·accessible name에 넣지 않는다.
- `2xx` 성공 response를 오류 body parsing 대상으로 만들지 않는다.
- GraphQL schema, API resolver, Media persistence와 workspace dependency를 변경하지 않는다.

**Verification**

- 정상 `2xx`, 모든 allowlisted status/code, 잘못 조합된 status/code, unknown/malformed/empty body, network와
  `5xx`, issue/complete 실패의 stage/reason을 table-driven unit test로 검증한다.
- 외부 message·URL·token fixture가 canonical 한국어 문구나 accessible name에 나타나지 않는지 검증한다.

- [x] 1.1 단계·원인 분류와 안전한 `{subject}` 기반 한국어 안내를 두 consumer가 공유할 수 있게 구현한다.
- [x] 1.2 전체 upload sequence가 issue/transfer/complete 실패를 구분하면서 기존 inactive·stale 결과 무시와 새 URL 재시도를 유지하게 연결한다.
- [x] 1.3 공통 분류·문구·sequence의 정상/오류/정보 비노출 테스트 matrix를 추가하고 통과시킨다.

## 2. PROD-657 Post Composer 원인별 실패 안내

**Authority / Provenance**

- `docs/design/media-upload-errors.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/media.md`
- `PROD-657`
- `PROD-553`

**Deliverable**

Post Composer가 실패한 각 이미지의 현재 순서와 원인에 맞는 안전한 안내를 표시하고 그 항목만 재시도하거나
제거할 수 있다.

**Guardrails**

- 실패 preview·선택 순서와 다른 Ready 항목을 보존한다.
- 완성된 항목 번호 문구를 실패 state에 고정하지 않고 현재 순서가 보이는 문구·alert·accessible name과 일치하게
  한다.
- 재시도는 실패 항목에 새 Uploading Media와 URL을 발급하고 자동 retry나 이전 URL 재사용을 추가하지 않는다.
- 제거·unmount 뒤 늦은 결과가 항목을 복구하거나 새 실패 alert를 만들지 않는다.

**Verification**

- 알려진 각 원인과 단계별 transient 문구, 새 실패 alert, 현재 순서를 포함한 재시도 name을 component test로
  검증한다.
- 항목 제거 뒤 순서 변경, 실패 보존, 새 URL 재시도, 다른 Ready 항목 불변과 stale completion 무시를 회귀
  테스트로 검증한다.

- [x] 2.1 Post Composer 실패 state와 표시를 공통 stage/reason·한국어 안내·접근성 계약에 연결한다.
- [x] 2.2 원인별 표시, alert/name, 항목 보존·제거·새 URL 재시도와 순서 변경 회귀 테스트를 추가하고 통과시킨다.

## 3. PROD-657 Profile 편집 원인별 실패 안내

**Authority / Provenance**

- `docs/design/media-upload-errors.md`
- `docs/design/profile-edit.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/media.md`
- `PROD-657`
- `PROD-492`

**Deliverable**

Profile 편집이 avatar/header 업로드 실패를 Post Composer와 같은 정책으로 안내하고, 실패 field만 재시도하면서
나머지 Profile draft와 Ready Media를 보존한다.

**Guardrails**

- `{subject}`는 `아바타 이미지` 또는 `헤더 이미지`처럼 현재 field가 소유한 안전한 label만 사용한다.
- 실패 field의 local preview, 다른 Ready field와 text·policy draft를 유지하고 upload 실패 중 Profile 저장을
  실행하지 않는다.
- field 교체·unmount 뒤 stale completion은 현재 draft나 오류 상태를 바꾸지 않는다.
- 저장 재시도는 이미 Ready인 Media를 재업로드하지 않고, upload 재시도는 실패 field에 새 Media/URL을 사용한다.

**Verification**

- avatar/header별 원인·단계 문구, alert와 field-scoped 재시도 accessible name을 component/route test로 검증한다.
- 한 field Ready/다른 field 실패, generation 교체, 실패 후 retry, Profile 저장 실패 뒤 Ready ID 재사용과 draft
  보존을 회귀 테스트로 검증한다.

- [x] 3.1 Profile 편집의 field별 upload 실패 state와 표시를 공통 stage/reason·한국어 안내·접근성 계약에 연결한다.
- [x] 3.2 field draft·다른 Ready 결과·save 차단·stale guard·새 URL 재시도를 포함한 원인별 회귀 테스트를 추가하고 통과시킨다.
- [x] 3.3 Profile 편집의 active spec과 Storybook 오류 상태를 canonical 공통 오류 정책에 맞게 정렬한다.

## 4. PROD-657 통합 검증과 OpenSpec 완료 책임

**Authority / Provenance**

- `docs/design/media-upload-errors.md`
- `docs/design/profile-edit.md`
- `docs/design/accessibility.md`
- `PROD-657`

**Deliverable**

Post Composer와 Profile 편집이 동일한 분류·문구·재시도 정책을 사용한다는 자동화와 현재 출시 대상 Web의 통합
증거를 확보하고, 전체 change 완료 뒤 정합성 확인과 archive 책임을 PROD-657이 소유한다.

**Guardrails**

- 한 consumer 구현이나 PR만 완료됐다는 이유로 change를 archive하지 않는다.
- 공통 계약, 두 consumer, 필수 package 검증과 delta spec 정합성이 모두 확인된 뒤에만 archive한다.
- Web runtime 증거를 Android·iOS 실제 기기 업로드, VoiceOver·TalkBack과 platform target 완료 증거로 사용하지
  않는다.
- request ID/logging, HEIC, 자동 retry와 orphan cleanup을 현재 검증 범위에 추가하지 않는다.

**Verification**

- `pnpm --filter @kosmo/app test`와 `pnpm lint:prettier`를 통과시킨다.
- Web에서 대표적인 원인별 실패와 transient 단계 실패가 안전한 문구·항목 보존·명시적 재시도로 이어지고 raw
  message가 보이지 않는지 확인한다.
- `openspec validate explain-image-upload-failures --strict`와 최종 artifact/spec 정합성을 확인한다.

- [ ] 4.1 App Relay·TypeScript·unit·Storybook 검증과 workspace Markdown formatting을 통과시킨다.
- [ ] 4.2 현재 출시 대상 Web에서 원인별/단계별 대표 실패, 보존·재시도와 접근성 상태를 수동 확인하고 Native runtime 미실행 범위를 기록한다.
- [ ] 4.3 1~3 및 4.1~4.2 완료 후 canonical 문서·Linear·delta spec 정합성을 확인하고, `openspec validate explain-image-upload-failures --strict`를 실행한다. 이후 active spec을 동기화한 뒤 archive하고, archive 후 `openspec validate --all --strict`를 실행한다.
