## 1. PROD-585 Remote Media 저장 variant

**Authority / Provenance**

- `docs/domain/objects/media.md`
- PROD-585

**Deliverable**

하나의 Media 저장 모델이 기존 Local upload를 유지하면서 원격 URL을 `media.url`에 가진 `REMOTE + READY` Media를 안전하게 저장한다.

**Guardrails**

- Remote Media에 별도 `remote_url`, synthetic Account, storage reference, upload expiry 또는 ready 시각을 만들지 않는다.
- 같은 Remote URL은 하나의 Media identity만 가지며 Local Media URL uniqueness는 바꾸지 않는다.
- 기존 Local Media row를 삭제하거나 synthetic URL/media type으로 rewrite하지 않는다. 필요한 백필은 Media Storage Service가 반환한 실제 representation만 사용한다.

**Verification**

- Local Uploading/Ready와 Remote Ready의 허용 field 조합을 검증한다.
- Remote Uploading, Remote URL 누락, Remote Local-field 혼합과 Remote URL 중복의 DB rejection을 검증한다.
- 기존 Local Media upload 시작·완료 테스트가 통과한다.

- [x] 1.1 Media schema가 Local/Remote nullable variant와 source별 invariant 및 Remote URL identity를 표현하도록 변경한다.
- [x] 1.2 권위 있는 representation 백필 결과를 전제로 source/state invariant migration과 migration regression test를 추가한다.
- [x] 1.3 Local upload 시작·완료의 type/runtime 회귀를 수정하고 검증한다.

## 2. PROD-585 원격 이미지 후보 projection

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/objects/post-content.md`
- PROD-585

**Deliverable**

원격 Note의 지원 가능한 embedded Image와 `image/*` Document attachment가 network fetch 없이 순서, URL, media type과 Alt Text를 가진 최대 네 개의 검증된 persistence 후보가 된다.

**Guardrails**

- 다른 embedded 타입과 IRI-only attachment는 무시한다.
- 다섯 개 이상이면 원래 순서의 앞 네 이미지 attachment만 사용하고 초과분은 저장하지 않는다.
- 선택한 후보의 URL 누락·복수, 비 HTTP(S)와 canonical duplicate는 Note 전체를 side-effect 없는 no-op으로 만든다.
- custom JSON-LD parser나 attachment metadata/image byte fetch를 추가하지 않는다.

**Verification**

- embedded Image, image/non-image Document, IRI-only, 4개/5개, malformed URL, 복수 URL과 duplicate URL fixture를 검증한다.
- IRI-only 및 embedded fixture에서 attachment용 document loader network가 호출되지 않음을 검증한다.

- [x] 2.1 Fedify vocabulary를 사용해 network 없이 ordered 이미지 후보를 선택·검증하는 inbound projection을 구현한다.
- [x] 2.2 지원·제외·초과·부적합 attachment 정책의 Fedify 단위 테스트를 추가한다.

## 3. PROD-585 원자적 Remote Media/Post materialization

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- PROD-585
- PROD-256

**Deliverable**

검증된 원격 이미지 attachment가 Remote Media와 같은 순서의 PostContent Media node가 되며 기존 ActivityPub Post 최초 materialization과 함께 commit 또는 rollback된다.

**Guardrails**

- 기존 canonical paragraph/link document 구조를 보존하고 Media node를 document 끝에 attachment 순서대로 결합한다.
- attachment name Alt Text는 Media에 저장하고 PostContent Media node에는 Media ID와 순서만 저장한다.
- 같은 작성자와 URL의 Media만 재사용하며 다른 작성자 소유권을 바꾸지 않는다.
- duplicate Create는 기존 Post/PostContent/Media를 갱신하지 않는다.
- Media를 Post transaction 밖에서 선행 commit하지 않는다.

**Verification**

- text+Image와 attachment-only Note의 Media row 및 canonical document를 검증한다.
- same-owner reuse, cross-owner conflict, duplicate object, concurrent URL/object와 강제 write failure에서 row 수와 rollback을 검증한다.
- 기존 text-only/HTML Note, remote Reply와 Local Post 작성이 회귀하지 않음을 검증한다.

- [x] 3.1 core ActivityPub Post action이 protocol-neutral Remote Media 후보를 같은 transaction에서 insert/reuse하고 canonical Media node document를 저장하도록 구현한다.
- [x] 3.2 Fedify inbound Create/Reply 경로를 Remote Media 후보와 원자적 core action에 연결한다.
- [x] 3.3 attachment-only, reuse, ownership conflict, duplicate, concurrent와 rollback 통합 테스트를 추가한다.

## 4. PROD-585 정합성 및 완료 검증

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/objects/post-content.md`
- PROD-585

**Deliverable**

canonical 문서, Linear 계약, OpenSpec과 구현이 같은 Remote Media 범위와 동작을 설명하고 repository 검증을 통과한다.

**Guardrails**

- Update(Note), remote fetch/proxy, Profile representation, client rendering과 Local outbound Note attachment를 이 change에 추가하지 않는다.
- active `attach-local-media-to-post` change의 완료·archive 책임을 가져오지 않는다.

**Verification**

- core/Fedify target test, TypeScript, ESLint, Prettier, syncpack, migration validation과 strict OpenSpec validation을 실행한다.
- diff에서 제외 범위와 generated artifact 불일치를 확인한다.

- [x] 4.1 canonical 문서, Linear 계약과 OpenSpec artifact의 구현 결과 정합성을 최종 확인한다.
- [x] 4.2 관련 target test와 workspace static check를 실행하고 실패를 수정한다.
- [x] 4.3 migration과 `openspec validate project-activitypub-remote-media --strict`를 통과시킨다.
