## 1. PROD-625 Remote Media identity

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `PROD-625`

**Deliverable**

같은 원본 Remote Profile과 canonical URL은 하나의 Media identity로 수렴하고, 서로 다른 Remote Profile은 같은
공용 URL을 각각 소유할 수 있다.

**Guardrails**

- 기존 Media identity와 Profile 소유권을 변경하지 않는다.
- Local Media source/state invariant를 변경하지 않는다.
- migration에 기존 row backfill이나 rewrite를 포함하지 않는다.

**Verification**

- migration SQL과 PostgreSQL catalog에서 Profile+URL partial unique index를 확인한다.
- 같은 Profile의 중복·동시 URL 수렴과 서로 다른 Profile의 같은 URL 저장을 core/Fedify 테스트로 검증한다.

- [x] 1.1 Remote Media identity와 기존 원격 Post Media 재사용 경계를 Profile+URL 계약에 맞춘다.
- [x] 1.2 기존 데이터를 보존하며 Remote Media partial unique index를 교체하는 migration을 생성한다.
- [x] 1.3 schema catalog와 원격 Post Media 회귀 검증을 통과시킨다.

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

- 최초 icon/image, 동일 URL 재사용, URL 교체, 표현 제거, invalid/IRI-only, stale refresh와 inbound
  Update를 Fedify DB 통합 테스트로 검증한다.
- 저장 실패가 Profile scalar, ActivityPubActor, Media와 ProfileMedia 변경 전체를 rollback하는지 검증한다.

- [x] 2.1 actor의 embedded icon/image를 no-network Profile Media 후보로 투영한다.
- [x] 2.2 actor materialization transaction에서 Remote Media와 kind별 ProfileMedia 관계를 생성·교체·제거한다.
- [x] 2.3 최초 lookup, stale refresh와 inbound Update의 표현 lifecycle 및 rollback 테스트를 추가한다.

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
- [x] 3.2 관련 test/typecheck/format과 strict OpenSpec validation을 통과시킨다.
- [ ] 3.3 구현 결과와 검증 증거를 Linear 및 Ready PR에 연결하고 change 완료 상태를 확인한다.
