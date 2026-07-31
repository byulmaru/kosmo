## 1. PROD-625 Remote Media identity

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `PROD-625`

**Deliverable**

Remote URL을 Media identity나 재사용 key로 사용하지 않고, 서로 다른 Post attachment와 Profile 표현이 같은
URL을 사용해도 별도 Media identity와 metadata를 가진다.

**Guardrails**

- 기존 Media identity와 Profile 소유권을 변경하지 않는다.
- Local Media source/state invariant를 변경하지 않는다.
- migration에 기존 row backfill이나 rewrite를 포함하지 않는다.

**Verification**

- migration SQL과 PostgreSQL catalog에서 Remote URL partial unique index가 없음을 확인한다.
- 같은 Profile/URL의 서로 다른 Post attachment, 같은 URL의 avatar/header 분리와 동시 materialization을
  core/Fedify 테스트로 검증한다.

- [x] 1.1 Remote Media insert를 URL index 유무에 모두 호환되는 transition 경로로 바꾼다.
- [x] 1.2 전역 URL index를 구·신버전 호환 `(profile_id, url)` transition index로 교체한다.
- [ ] 1.3 PROD-625 production 배포, 구버전 active/preview 배수와 rollback window 종료를 확인한다.
- [ ] 1.4 PROD-627 contract release에서 마지막 Remote URL unique index를 제거한다.
- [ ] 1.5 schema catalog와 같은 URL의 독립 Media 회귀 검증을 통과시킨다.

## 2. PROD-625 원격 Profile 표현 materialization

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- `PROD-625`

**Deliverable**

원격 actor의 유효한 embedded icon/image가 최초 lookup과 refresh에서 Profile avatar/header로 조회되고, 변경과
제거가 actor projection과 원자적으로 동기화된다.

**Guardrails**

- IRI-only 또는 부적합한 표현을 위해 추가 network fetch를 수행하지 않는다.
- 부적합한 표현 때문에 기본 Profile materialization을 실패시키지 않는다.
- 관계에서 제거된 기존 Remote Media를 물리 삭제하지 않는다.
- 기존 최신 refresh 우선, instance gating과 actor collision 계약을 유지한다.

**Verification**

- 최초 icon/image, 같은 URL의 avatar/header 분리, 동일 kind refresh, URL 교체, 표현 제거, invalid/IRI-only, stale refresh와 inbound
  Update를 Fedify DB 통합 테스트로 검증한다.
- 저장 실패가 Profile scalar, ActivityPubActor, Media와 ProfileMedia 변경 전체를 rollback하는지 검증한다.

- [x] 2.1 actor의 embedded icon/image를 no-network Profile Media 후보로 투영한다.
- [x] 2.2 actor materialization transaction에서 Remote Media와 kind별 ProfileMedia 관계를 생성·교체·제거한다.
- [x] 2.3 최초 lookup, stale refresh와 inbound Update의 표현 lifecycle 및 rollback 테스트를 추가한다.
- [ ] 2.4 contract 뒤 같은 URL의 avatar/header가 첫 refresh에서 별도 Media로 분리되는지 검증한다.

## 3. PROD-625 공개 조회와 완료 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `PROD-625`

**Deliverable**

materialize된 원격 avatar/header가 기존 GraphQL Profile Media 계약에서 조회되고 관련 backend 및 명세 검증이
완료된다.

**Guardrails**

- GraphQL schema와 client UI를 변경하지 않는다.
- 기존 avatar/header null fallback과 Local Profile Media 조회를 유지한다.

**Verification**

- API 통합 테스트에서 원격 Profile의 Ready avatar/header URL 조회를 검증한다.
- core/Fedify/API 관련 테스트, TypeScript, formatting과 strict OpenSpec validation을 실행한다.

- [x] 3.1 기존 GraphQL Profile avatar/header 조회에서 원격 Ready Media가 노출되는 통합 검증을 추가한다.
- [ ] 3.2 관련 test/typecheck/format과 strict OpenSpec validation을 통과시킨다.
- [ ] 3.3 구현 결과와 검증 증거를 Linear 및 Ready PR에 연결하고 change 완료 상태를 확인한다.
