## Context

이 기록은 2026-09-09 사용자가 승인하고 PROD-935에 반영한 WebP encoding 미지원 브라우저 대응을 정리한다. 기존 `openspec/specs`는 WebP 지원 환경의 baseline이며, 구체 MIME을 도메인 계약으로 고정하지 않는 canonical 문서와 새 Linear contract를 함께 확인해 이번 client fallback의 범위를 정한다.

## Decision Records

### WebP를 기본 출력으로 유지하고 encoding 미지원 시 PNG를 허용한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-881, [PROD-935](https://linear.app/byulmaru/issue/PROD-935/webp-미지원-브라우저에서-이미지-업로드-png-fallback을-지원한다)
- Status: Active
- Context / Problem: 기존 공통 경계는 WebP encoding 결과만 성공으로 처리했지만 Safari처럼 WebP canvas encoding을 지원하지 않는 브라우저는 PNG 결과를 반환해 signed PUT 전에 실패한다. Domain canonical은 구체 MIME 목록을 client 계약으로 고정하지 않으므로 이 예외는 PROD-935에서 downstream upload 계약으로 정밀화했다.
- Decision Outcome: WebP를 생성할 수 있는 환경에서는 품질 `0.8` WebP와 `image/webp` PUT을 유지한다. 요청한 WebP encoding을 지원하지 않아 실제 결과가 PNG인 환경에서는 같은 크기 정규화 결과를 PNG byte와 `image/png`로 직접 전송한다. 긴 변 최대 `2048px`, 비율 유지와 no-upscale은 모든 결과에 적용하고 PNG에 새 품질·byte 정책은 추가하지 않는다.
- Alternatives Considered: 모든 환경에서 PNG로 바꾸면 기존 WebP 저장 형식 계약을 불필요하게 변경한다. 미지원 환경에서 원본을 직접 보내면 긴 변 제한과 크기 정규화를 우회한다. 미지원 환경의 업로드 실패를 유지하면 Safari 사용자가 이미지 업로드를 완료할 수 없다.
- Consequences: 지원 브라우저와 미지원 브라우저의 결과 MIME은 다를 수 있지만, 각 PUT body와 Content-Type은 일치해야 한다. 서버와 persistence 계약은 변경하지 않는다.
- Confirmation / Follow-up: 공통 경계의 지원·미지원 실행 결과와 2048px/no-upscale을 검증한다. 실제 Safari smoke evidence를 확보하지 못하면 그 한계를 명시하고 성공으로 추정하지 않는다.

### fallback은 공통 경계에서 WebP encoding 미지원 신호에만 적용한다

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/media-upload-errors.md`, `docs/domain/objects/media.md`, [PROD-935](https://linear.app/byulmaru/issue/PROD-935/webp-미지원-브라우저에서-이미지-업로드-png-fallback을-지원한다)
- Status: Active
- Context / Problem: consumer별 fallback이나 모든 변환 오류에 대한 PNG 재시도는 오류 분류와 공통 lifecycle을 깨뜨릴 수 있다.
- Decision Outcome: 공통 이미지 업로드 경계가 요청한 WebP를 만들 수 없고 실제 변환 결과가 `image/png`임을 나타낼 때만 PNG 경로를 사용한다. 일반 변환·read·PUT·complete 실패는 기존 오류·Sentry 경계로 전달하며, Post Composer와 Profile은 같은 결과 byte/MIME과 issue→정규화→read→PUT→complete, retry, stale 처리를 공유한다.
- Alternatives Considered: consumer별 구현은 중복 lifecycle을 만들고, user agent 추측은 runtime 차이에 취약하다. 서버 변환은 signed PUT과 Storage Service 경계를 변경한다.
- Consequences: 구현은 실제 WebP encoding 미지원 신호를 좁게 판별해야 한다. 검증은 공통 실행 테스트와 가능한 Web smoke evidence에 집중하며 Native 기기 결과를 Web 결과로 간주하지 않는다.
- Confirmation / Follow-up: WebP 성공, PNG fallback, 일반 오류와 body/MIME 불일치 방지의 실행 테스트를 통과시킨다.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
