## 1. PROD-881 공통 이미지 업로드 정규화

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/design/media-upload-errors.md`
- `docs/design/profile-edit.md`
- PROD-881

**Deliverable**

Post Composer와 Profile avatar/header가 선택한 이미지를 긴 변 최대 `2048px`, 품질 `0.8`의 WebP로 정규화해 기존 signed URL에 직접 업로드한다.

**Guardrails**

- 기준 이하 이미지를 확대하지 않는다.
- PUT body와 Content-Type은 같은 WebP 변환 결과를 사용한다.
- Post picker·Web clipboard와 Profile은 PROD-688의 공통 업로드 경계를 함께 사용하고 consumer별 변환 구현을 만들지 않는다.
- 기존 issue→transfer→complete, retry, stale result, preview와 오류 분류를 변경하지 않는다.
- GraphQL, Media persistence와 Media Storage Service 계약을 변경하지 않는다.

**Verification**

- landscape, portrait, square의 기준 초과 입력과 정확한 `2048px` 경계·기준 이하 입력에서 dimension과 no-upscale를 검증한다.
- 모든 성공 변환의 WebP 품질 옵션, PUT body와 `image/webp` header를 검증한다.
- Post picker·Web clipboard와 Profile의 정상 upload, 실패·retry와 stale result 회귀 테스트를 통과시킨다.

- [x] 1.1 앱 workspace에 현재 Expo SDK와 호환되는 Web·Android·iOS 이미지 변환 dependency를 pnpm CLI로 추가한다.
- [x] 1.2 공통 업로드 경계에 비율 유지 `2048px` downscale, no-upscale와 WebP 품질 `0.8` 정규화를 구현해 변환 결과를 signed PUT에 연결한다.
- [x] 1.3 경계값·비율·WebP encode·PUT body/header 단위 테스트와 변환 실패 회귀를 추가한다.
- [x] 1.4 Post Composer의 picker·Web clipboard와 Profile avatar/header가 공통 결과를 사용하며 기존 upload·retry·stale state 계약을 유지하는 회귀 테스트를 정렬한다.

## 2. PROD-881 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/design/media-upload-errors.md`
- `docs/design/profile-edit.md`
- PROD-881

**Deliverable**

지원 플랫폼에서 정규화된 WebP가 실제 업로드되고, 변경 전체의 완료 증거와 delta spec 정합성이 확인된 뒤 OpenSpec을 완료한다.

**Guardrails**

- Web 검증을 Android/iOS 실제 변환 결과로 대신하지 않는다.
- 크기와 WebP 형식 이외의 이미지 정책을 이 변경에서 추가하지 않는다.
- PROD-657의 오류 분류·안전한 안내·실패 보존 계약을 포함한 누적 `post-composer-media-upload` requirement를 보존한다.
- 전체 scope와 검증이 완료되기 전 OpenSpec을 archive하지 않는다.

**Verification**

- 앱 typecheck, unit test, Storybook build/browser test, formatting과 strict OpenSpec validation을 통과시킨다.
- Web·Android·iOS에서 기준 초과 및 기준 이하 이미지를 각각 선택해 결과 dimension, WebP Content-Type과 성공 upload를 확인한다.

- [x] 2.1 앱 typecheck, 전체 unit test, Storybook build/browser test, formatting과 strict OpenSpec validation을 실행한다.
- [x] 2.2 Web에서 기준 초과·기준 이하 이미지의 실제 변환과 signed PUT 성공을 검증한다.
- [ ] 2.3 Android와 iOS에서 기준 초과·기준 이하 이미지의 실제 변환과 signed PUT 성공을 각각 검증한다.
- [ ] 2.4 `explain-image-upload-failures`의 PROD-657 delta가 active spec에 먼저 동기화됐는지 확인하고, 모든 구현·플랫폼 검증 증거를 PROD-881과 PR에 기록한 뒤 누적 delta spec 정합성을 확인한 담당자가 이 change를 archive한다.
