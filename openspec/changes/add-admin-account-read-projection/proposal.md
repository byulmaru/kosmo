## Why

Admin Console 기반은 배포됐지만 운영자가 Account를 확인할 수 있는 읽기 화면이 없다. PROD-691은 기존
Tailscale Viewer 경계 안에서 Account 목록과 상세를 제공해 첫 번째 실제 운영 조회 흐름을 완성한다.

## What Changes

- Account ID 역순 keyset pagination으로 한 페이지에 최대 50개의 Account 목록을 제공한다.
- Account 목록에는 ID, 표시 이름, State, 생성 시각만 반환한다.
- Account ID로 상세를 조회하고 목록 필드와 전체 OIDC subject를 반환한다.
- 목록과 상세를 SvelteKit server loader에서 read query 계층으로 직접 조회한다.
- Account를 찾을 수 없거나 잘못된 ID가 전달되면 일반 404를 반환하고 내부 조회 오류는 노출하지 않는다.
- Admin shell에서 Account 목록으로 이동할 수 있는 링크를 제공한다.

## Authority / Provenance

- Canonical: `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`
- Linear Contract: `PROD-689`
- Linear Implementations: `PROD-691`

## Capabilities

### New Capabilities

- `admin-account-read-projection`: Admin Console Viewer를 위한 분리된 Account 목록·상세 projection과 조회 실패
  경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/admin`: Account read query, 목록·상세 server loader와 Svelte UI
- `packages/core/db`: 기존 Account schema와 공용 database handle 사용
- workspace dependency/lockfile: Admin에서 `@kosmo/core`와 최소 UI 스타일 도구 사용
- canonical Admin Console 문서와 CI: Account projection 계약 및 DB-backed Admin 검증
