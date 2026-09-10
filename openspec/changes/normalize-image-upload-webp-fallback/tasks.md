## 1. PROD-935 WebP 미지원 브라우저 PNG fallback

> **2026-09-10 문서 정정:** 실제 Safari Web 앱 빌드의 fallback → PNG → signed PUT → `complete` 성공 확인은 선택적 evidence가 아니라 완료 필수 검증이다. 이는 2026-09-09 승인된 PNG fallback 제품 정책이나 범위를 변경하지 않는다.

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/design/media-upload-errors.md`
- PROD-881
- `PROD-935`

**Deliverable**

공통 이미지 업로드 경계가 WebP 지원 환경에서는 기존 WebP 결과를 유지하고, WebP encoding 미지원으로 PNG가 반환되는 환경에서는 동일하게 크기를 정규화한 PNG byte를 `image/png`로 직접 PUT해 업로드를 완료한다.

**Guardrails**

- 긴 변 최대 `2048px`, 비율 유지와 no-upscale을 모든 결과에 적용한다.
- PNG fallback은 요청한 WebP encoding 미지원으로 실제 `image/png` 결과가 반환되는 경우에만 적용한다.
- PUT body와 Content-Type을 실제 결과에 맞추고, 원본 byte·원본 Content-Type을 직접 전송하지 않는다.
- WebP 지원 환경의 품질 `0.8`과 `image/webp` PUT을 유지한다.
- Post Composer와 Profile이 공통 경계의 issue→정규화→read→PUT→complete, retry, stale와 오류 처리를 공유한다.
- 서버, GraphQL, persistence, Native Blob, HEIC/HEIF decoder와 새 품질·byte 정책은 변경하지 않는다.

**Verification**

- WebP 성공, PNG fallback, 일반 변환 실패의 실행 결과와 오류 분기를 확인한다.
- 결과 dimension과 PUT body/Content-Type 일치, PUT/complete 순서와 기존 오류 관찰 경계를 확인한다.
- 공통 경계를 사용하는 Post Composer와 Profile 호출 결과의 회귀를 확인한다.
- WebKit/Safari 유사 브라우저에서 fallback smoke를 실행해 보조 evidence를 기록하고, 실제 Safari Web 앱 빌드에서 fallback → PNG byte → `image/png` signed PUT → `complete` 성공을 반드시 확인한다. 실제 Safari evidence가 없으면 1.4와 change는 미완료이며, WebKit 결과를 실제 Safari나 Native 기기 검증으로 간주하지 않는다.
- WebKit 26.4 raw Canvas probe에서 `2048×1365` `toBlob('image/webp')`가 `image/png` `52,159 bytes`를 반환했고 명시적 PNG 저장도 `image/png` `52,159 bytes`를 반환했다. 이는 엔진 smoke 증거이며 Expo 전체 bundle·실제 Safari UI·iPhone·운영 PUT 증거가 아니다.

- [x] 1.1 WebP 지원 환경의 기존 변환 결과와 WebP encoding 미지원으로 PNG가 반환되는 결과를 공통 업로드 경계에서 각각 처리한다.
- [x] 1.2 fallback 결과의 byte와 `Content-Type`을 맞추고 기존 upload/complete, retry·stale·오류 경계를 보존한다.
- [x] 1.3 지원·미지원·일반 실패 및 2048px/no-upscale, PUT body/header 일치의 실행 테스트를 통과시킨다.
- [ ] 1.4 WebKit/Safari 유사 환경 검증은 보조 결과로 기록하고, 실제 Safari Web 앱 빌드에서 fallback → PNG signed PUT → `complete` 성공 evidence를 확보한다.
- [ ] 1.5 실제 Safari 검증을 포함한 구현·검증이 완료되면 최신 canonical·Linear·delta를 다시 대조하고 change 전체를 archive한 뒤 strict validation을 통과시킨다.
