## 1. PROD-691 Account read projection

**Authority / Provenance**

- `docs/domain/policies/admin-console-read.md`
- `docs/architecture/admin-console.md`
- `PROD-691`

**Deliverable**

Admin Console Viewer가 허용 필드만 포함한 Account 목록과 Account ID 상세를 읽을 수 있다.

**Guardrails**

- 목록은 Account ID 역순 keyset으로 최대 50개를 반환하고 이전·다음 페이지를 제공한다.
- 상세만 전체 OIDC subject를 반환한다.
- Account 상태를 변경하지 않는다.

**Verification**

- DB-backed test에서 projection 필드, 정렬, 페이지 경계, 상세와 not-found를 검증한다.

- [x] 1.1 Account 목록과 상세 read query를 구현한다.
- [x] 1.2 목록 pagination과 상세 실패 경계의 DB-backed test를 추가한다.

## 2. PROD-691 Account Admin 화면

**Authority / Provenance**

- `docs/domain/policies/admin-console-read.md`
- `docs/architecture/admin-console.md`
- `PROD-691`

**Deliverable**

Admin shell에서 Account 목록으로 이동하고 목록 row에서 Account 상세를 확인할 수 있다.

**Guardrails**

- 기존 Tailscale Viewer admission과 no-store/CSP 응답 경계를 유지한다.
- 별도 REST·GraphQL transport를 추가하지 않는다.

**Verification**

- loader와 UI test에서 정상 목록·상세, cursor validation, 404와 read-only method 경계를 확인한다.
- Svelte typecheck와 production build를 통과시킨다.

- [x] 2.1 Account 목록·상세 server loader와 route를 구현한다.
- [x] 2.2 현재 화면에 필요한 최소 shadcn-svelte component로 목록·상세 UI를 구성한다.
- [x] 2.3 root shell에 Account 목록 navigation을 추가한다.
- [x] 2.4 loader·UI 검증과 Admin package check·build를 통과시킨다.

## 3. PROD-691 전달과 통합 검증

**Authority / Provenance**

- `docs/domain/policies/admin-console-read.md`
- `docs/architecture/admin-console.md`
- `PROD-691`

**Deliverable**

Account read projection이 기존 Admin runtime과 repository 검증 경계에서 배포 가능한 상태다.

**Guardrails**

- schema migration과 Admin-specific logging을 추가하지 않는다.
- canonical 문서와 구현의 projection 책임을 일치시킨다.

**Verification**

- OpenSpec strict validation, repository lint·format·dependency 검사와 Admin image 검증을 통과시킨다.
- PR head의 GitHub CI 결과를 확인한다.

- [x] 3.1 canonical 문서와 dependency·build 구성을 구현과 일치시킨다.
- [ ] 3.2 로컬 repository 검증을 통과시킨다.
- [ ] 3.3 GitHub Stack PR을 게시하고 새 head의 CI를 통과시킨다.
