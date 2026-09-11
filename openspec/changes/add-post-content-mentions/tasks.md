## 1. PROD-340 inbound Mention projection and revision storage

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- `PROD-259`
- `PROD-340`

**Deliverable**

검증된 inbound typed `Mention`이 canonical Post Content document의 occurrence와 `post_mentions` table의 immutable revision-owned Profile 관계로 저장되고, 같은 revision/Profile 관계는 중복 없이 투영된다.

**Guardrails**

- 일반 HTML anchor와 `to`/`cc` audience actor URI를 Mention으로 추론하지 않는다.
- actor materialization·refresh가 같은 Actor document의 `url`에서 hostname이 있는 HTTP(S)로 검증한 nullable profile URL alias를 기존 Actor identity에 연결해 저장하고, Actor URI와 다른 hostname이어도 직접 광고된 URL이면 허용한다. inbound adapter가 typed tag의 actor URI를 기존 Local/Remote Profile stable identity로 확인한다. 전달한 허용 href와 `profileId`만 관계 입력으로 인정한다. Local은 trusted canonical origin과 기존 Profile URL 규칙의 human URL을 함께 허용하고, Remote는 저장된 Actor URL alias가 있으면 actor URI와 함께 허용하며 없으면 actor URI만 사용한다. core parser는 본문 anchor href가 허용 href에 대응하는지 확인하며, tag `name`·handle과 본문 visible label의 exact match만으로 Profile을 연결하거나 거부하지 않는다.
- 서로 다른 `profileId` 후보가 동일한 허용 href를 공유할 때 core parser의 normalized href matching 경계에서 ambiguous로 처리해 first match로 하나를 선택하지 않고 안전 fallback으로 낮춘다.
- canonical document에는 external URI를 저장하지 않으며 core 저장 경계에서 별도 ActivityPub actor lookup·remote lookup·fallback 재검증을 수행하지 않는다. Actor URL alias는 actor materialization·refresh metadata에만 저장하고 Mention 수신 중 fetch하지 않는다. Local Post Content validator는 Mention node를 write 전에 거부한다.
- document, `post_mentions` persisted revision-to-Profile 관계와 Current Content pointer는 같은 저장 경계에서 원자적으로 처리하며 과거 revision을 변경하지 않는다. `post_mentions` row는 해당 Post Content revision과 Profile을 foreign key로 가리킨다.
- duplicate remote `Create`는 first-write-wins no-op으로 유지하고 `Update(Note)`로 승격하지 않는다.
- unresolved·malformed·identity mismatch는 안전한 link 또는 표시 text로 낮추고 신규 원격 Profile lookup/materialization을 수행하지 않는다.

**Verification**

- 검증된 단일·다중 Mention, 같은 Profile의 반복 occurrence, 서로 다른 Profile의 occurrence 순서와 relation set 결과를 실행 검증한다.
- Actor document의 `id`와 `url`이 다른 Remote actor fixture에서 materialization·refresh가 hostname이 있는 HTTP(S) URL alias를 저장하고 collector가 actor URI와 alias를 허용 href로 전달하는지 검증한다. refresh document에서 `url`이 빠지거나 malformed이면 기존 alias를 제거하고 actor URI만 남기는지 확인한다. alias가 null·malformed인 기존 row는 actor URI만 사용하고 Mention 수신 중 fetch하지 않는지 검증한다. 서로 다른 Profile에 같은 alias가 나타나면 collector/parser가 first match를 선택하지 않고 안전 fallback으로 낮추는지 검증한다.
- `post_mentions` row가 해당 Post Content revision과 Profile foreign key를 가리키고, 같은 revision/Profile 중복을 만들지 않는지 검증한다.
- 일반 link·audience-only·identity resolution 실패·허용 href에 대응하지 않는 anchor·안전하지 않은 label 입력·ambiguous href가 relation을 만들지 않고 안전 fallback으로 저장되는지 검증한다. Local actor URI와 human Profile URL 표현이 다른 Mastodon fixture와 tag name/본문 label이 다른 fixture, Remote actor URI와 actor가 광고한 profile URL이 다른 fixture, alias가 없는 Remote fixture에서 같은 Profile identity가 올바르게 보존되거나 actor URI-only fallback되는지, 서로 다른 Profile identity가 각기 독립적으로 검증되는지 함께 확인한다.
- local Note의 plain text/HTML 파생이 label text와 기존 safe link를 보존하고 outbound typed Mention federation을 추가하지 않는지 회귀 검증한다.
- `post_mentions` relation 또는 Current Content pointer 저장 실패가 새 Post/Content와 함께 rollback되는지 검증한다.
- 동일 remote object URI의 동일·변경된 duplicate Create가 기존 document, relation, timestamp를 유지하는지 검증한다.
- HTML formatting만 달라지고 canonical body·Mention identity가 같은 duplicate Create도 새 revision을 만들지 않는지 검증한다.

- [x] 1.1 actor materialization·refresh에서 Actor가 광고한 HTTP(S) profile URL alias를 기존 Actor identity에 nullable metadata로 저장하고, inbound `tag`의 typed Mention actor URI를 기존 Profile stable identity와 확인한다. Local의 trusted human URL 또는 Remote의 stored Actor URL alias와 actor URI 허용 href 및 `profileId`만 core parser 경계에 전달하고, alias가 없으면 actor URI만 전달한다. parser는 원문 HTML에서 본문 visible label을 읽어 안전하게 정규화한다. audience·일반 link와 분리하며 core HTML/plain-text parser에는 Fedify vocabulary나 DB/remote lookup을 주입하지 않는다.
- [x] 1.2 검증된 Mention occurrence와 Profile membership을 canonical document·`post_mentions` revision 저장 결과에 반영하고 반복 occurrence와 relation deduplication을 보장한다. 현재 구현 선택은 `{ profileId, label }` node attrs와 `(post_content_id, profile_id)` composite primary key·foreign key relation이다.
- [x] 1.3 actor URL alias 유무·malformed·identity mismatch·unresolved fallback, duplicate Create no-op과 원자적 rollback의 행동 검증을 추가하고 통과시킨다. alias가 이후 materialization·refresh에서 채워져도 이미 저장된 기존 글을 자동 보정하지 않는다.

## 2. PROD-340 legacy reader compatibility and activation gate

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `PROD-340`
- 2026-09-10 사용자 선택: 구 reader의 plain text fallback 허용

**Deliverable**

서버의 본문 파생값에서 GraphQL `bodyText`와 legacy renderer 표시까지 글자·Media·Content Warning 보존을 end-to-end로 증명한 뒤 Mention 저장을 활성화할 수 있다. 구 reader는 기존 `bodyText` fallback의 plain text 표시를 사용하며 link 클릭 동작과 문단 구조의 일시적 저하를 허용한다.

**Guardrails**

- 호환 증거 전에는 Mention node와 관계 저장을 활성화하지 않는다.
- 기존 `bodyText` fallback을 재사용하고, 구 reader에서도 글자·Media·Content Warning을 보존한다.
- link 클릭 동작·문단 구조 저하는 허용하지만 안전 parser와 Content Warning/Media 표시 보존을 약화시키지 않는다.
- Mention은 기존 Post Content V1에 additive하게 저장하며, document schema version bump나 V1/V2 dual-read 또는 document version 변환을 도입하지 않는다. 이 결정은 relation persistence를 위한 additive DB migration을 금지하지 않는다.
- exact Mention node attr/field와 `post_mentions` column/index/primary-key shape는 `decisions.md`와 `design.md`에 구현 선택으로 기록하며, 이를 제품 계약으로 가장하지 않는다.

**Verification**

- Mention 전용 표시를 모르는 reader에서 server canonicalizer → GraphQL `bodyText` → legacy renderer 경로의 body text·Media·Content Warning을 end-to-end로 검증한다.
- plain text fallback에서 허용된 link 클릭·문단 저하를 확인하고, 글자·Media·Content Warning 손실은 실패로 처리한다.
- 호환 증거 전후의 storage activation gate와 기존 Post Content V1 additive 경로를 검토 가능한 기록으로 남긴다.

- [ ] 2.1 기존 reader와 새 canonicalizer 조합의 body text·Media·Content Warning preservation 검증을 실제 API와 reader 경로로 실행한다.
- [ ] 2.2 기존 `bodyText` fallback이 적용된 plain text reader 결과와 허용된 link/문단 저하를 확인한다.
- [ ] 2.3 호환 증거를 기준으로 기존 Post Content V1 additive 경로에서 Mention 저장 활성화와 rollback 조건을 기록·검증한다. migration은 writer 활성화 전에 적용하고, document schema V2·V1/V2 dual-read·document version 변환·새 feature flag는 도입하지 않는다.

**2.x 실행 증거 상태 (2026-09-10, compatibility gate 미완료)**

- 실제 API response에서 `bodyText`는 `앞쪽 @mentioned 뒤쪽`, Content Warning은 `통합 검증 경고`로 확인했다. 이는 서버 파생값 확인이며, Mention 전용 표시를 모르는 구 client 또는 pre-change reader가 body text를 보존한다는 증거가 아니다.
- 이 PR에서 제거한 document-level fallback을 전제로 한 reader harness 결과는 2.x compatibility evidence로 유지하지 않는다.
- 따라서 2.1·2.2의 legacy reader preservation과 2.3의 activation gate는 완료로 표시하지 않는다. `PROD-340` 저장 계약의 구현·검증과 별도로 reader compatibility 및 writer 활성화 확인은 이 change의 미완료 범위로 남긴다. 계획된 rollout 순서는 migration 적용 → 독립적인 reader gate 통과 → writer 활성화이며, 이 실행 기록은 그 gate 통과를 주장하지 않는다.
- rollback은 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하며, pre-Mention binary 전체 rollback은 별도 호환·데이터 대응 증거 없이는 안전하다고 주장하지 않는다.
- Gallery 내부 시각 검증과 Live HTTP 동시 수행은 이 task의 증거로 주장하지 않는다.

## 3. PROD-910 renderer, Profile 이동 and integration/archive

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `PROD-340`
- `PROD-910`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `docs/design/post-thread.md`

**Deliverable**

현재 Post Content의 canonical Mention node와 revision-owned Profile 관계를 renderer가 표시하고, 검증된 Profile 이동·접근성·저장 경계 통합 검증을 완료한 뒤 `PROD-910`의 archive 완료 증거를 남긴다.

**Guardrails**

- renderer는 raw ActivityPub tag를 다시 해석하거나 신규 원격 Profile lookup/materialization을 수행하지 않는다.
- Post visibility·eligibility와 기존 접근성 계약을 유지하며 Mention 표시나 `to`/`cc` 값으로 viewer 접근 범위를 넓히지 않는다.
- unresolved·malformed·identity mismatch fallback은 Profile 이동 affordance 없이 안전한 link/text로 표시한다.
- 긴 Profile 이름과 서로 유사한 대상도 stable identity에 따라 구분하고 label이 겹쳐도 잘못된 Profile 이동을 만들지 않는다.
- `PROD-911` Notification·FCM 구현은 이 task group에 포함하지 않는다.

**Verification**

- current revision의 valid Mention 표시·Profile 이동, repeated occurrence/deduplicated relation과 unresolved fallback을 renderer에서 실행 검증한다.
- visibility·eligibility, Profile block/domain safety, keyboard/screen-reader 접근성 회귀를 통합 검증한다.
- 긴 이름·유사 대상, Light/Dark, Web keyboard·screen reader, Native touch·accessible focus 경계를 포함해 `PROD-910`의 renderer 계약을 실행 검증한다. 실행 환경이 없는 플랫폼은 검증 범위를 완료로 일반화하지 않는다.
- inbound 저장 결과, reader compatibility gate와 renderer 결과를 함께 확인하고 `PROD-910` 구현·통합 완료 후 delta spec 동기화, archive와 archive 후 validation 증거를 정리한다.

- [ ] 3.1 canonical Mention node와 current revision Profile relation을 소비하는 renderer 표시·Profile 이동·접근성을 구현한다.
- [ ] 3.2 valid, repeated, mismatch/fallback와 visibility·eligibility 입력의 통합 검증을 실행한다.
- [ ] 3.3 `PROD-340` 저장·reader gate와 `PROD-910` renderer 결과를 함께 점검하고, 전체 완료 후 delta spec 동기화·`PROD-910` archive·archive 후 validation까지 실행한다.

## Verification Boundary

- 기존 root-wide TypeScript 로그에서 baseline과 current 모두 6,091 diagnostics를 기록했으며, 이를 이번 change의 원인으로 재분류하지 않는다.
- Core 범위 filtered 비교는 baseline과 current가 같은 6개 diagnostics를 유지했다.
- 변경된 Core 구현만 대상으로 한 typecheck는 통과했다.
- 이 기록은 broad typecheck 재실행을 의미하지 않으며, reader compatibility gate·renderer·통합·archive 검증은 2.x·3.x task가 소유한다.
