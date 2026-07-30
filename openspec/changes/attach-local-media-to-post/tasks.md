## 1. PROD-554 PostContent V1 Media 작성 계약

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- PROD-461
- PROD-554

**Deliverable**

GraphQL Post 작성자가 소유한 Ready Local Media를 최대 4개까지 순서와 revision별 Alt Text로 첫 PostContent V1
document에 저장하고 Sensitive Media를 같은 revision에서 조회할 수 있다.

**Guardrails**

- 별도 Post-Media table, Media ID array, Post Sensitive Media column 또는 Media Alt Text column을 만들지 않는다.
- Media Profile과 Author Profile 일치나 InstanceKind.LOCAL을 요구하지 않고 Upload Account만 비교한다.
- GraphQL global ID를 DB document에 저장하거나 DB UUID를 GraphQL document에 노출하지 않는다.
- Post와 첫 PostContent는 하나의 transaction에서 성공하거나 함께 rollback한다.
- 기존 V1 document와 body-only Post·Reply를 유지하고 기존 Post 수정 기능을 추가하지 않는다.

**Verification**

- 기존 V1과 paragraph/Media 혼합, omitted Sensitive Media, canonical equality와 unknown node/attr를 검증한다.
- body-only/media-only/body+media, 일반 Post·Reply, 순서와 4개 경계를 검증한다.
- duplicate·5개·없는/Uploading/Remote/다른 Account Media와 전체 rollback을 확인한다.
- GraphQL Media global ID input/output, wrong typename과 내부 UUID·storage reference 비노출을 확인한다.

- [x] 1.1 V1 Media node, document Sensitive Media, canonicalization과 Plain Text projection을 구현하고 기존 V1 호환 검증을 추가한다.
- [x] 1.2 Local Post 작성 service에 ordered Media item 검증과 첫 PostContent 원자 저장을 구현한다.
- [x] 1.3 `createPost` Media item/Sensitive Media input과 PostContent document ID projection을 구현하고 schema를 동기화한다.
- [x] 1.4 core/API 성공·거부·권한·순서·rollback 회귀 검증과 관련 backend check를 통과시킨다.

## 2. PROD-553 Post Composer 이미지 업로드

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- PROD-461
- PROD-553
- PROD-554

**Deliverable**

Web/iOS/Android Post Composer 사용자가 갤러리 이미지 최대 4개를 선택 즉시 직접 업로드하고 item별
preview·상태·재시도·제거·Alt Text와 Sensitive Media를 관리해 새 Post를 작성할 수 있다.

**Guardrails**

- byte는 Kosmo API가 아니라 발급된 Media Storage Service URL로 직접 전송한다.
- 카메라, upload cancel/delete, orphan cleanup, Post 수정과 목록·상세 Media 렌더링을 추가하지 않는다.
- Ready가 아닌 Media를 Post input에 포함하거나 실패한 제한 URL을 재사용하지 않는다.
- 공용 React Native UI, Relay colocation, platform별 target과 accessible name/state를 유지한다.

**Verification**

- picker 취소·다중 선택·남은 슬롯과 선택 순서를 확인한다.
- 시작·PUT·완료 성공, 각 단계 실패, 새 Media 재시도, 제거 뒤 late completion을 확인한다.
- body-only/media-only, Alt Text/Sensitive Media, upload/submit disabled와 성공·실패 상태 보존·초기화를 확인한다.
- Storybook 상태, Web keyboard/a11y, Native-safe type/build와 Relay compile을 확인한다.

- [x] 2.1 Expo SDK 호환 이미지 picker dependency와 platform 설정을 `pnpm` CLI로 추가한다.
- [x] 2.2 갤러리 선택과 item별 direct upload·Ready 완료·재시도·제거 상태를 구현한다.
- [x] 2.3 Composer에 preview, 상태, 제거, Alt Text와 Sensitive Media control을 접근 가능한 공용 UI로 구현한다.
- [x] 2.4 ordered Ready Media item을 `createPost`에 연결하고 submit gating·성공 초기화·오류 보존을 구현한다.
- [x] 2.5 component/Relay/Storybook 상태와 접근성 회귀 검증을 추가하고 app check를 통과시킨다.

## 3. PROD-581 Local Media 공개 표현 저장

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- PROD-461
- PROD-581

**Deliverable**

Local Media 업로드 완료 시 Media Storage Service가 확정한 공개 URL과 media type을 Ready 전환과 함께 DB에
저장한다.

**Guardrails**

- Kosmo가 storage reference에서 공개 URL이나 provider 경로 규칙을 추론하지 않는다.
- 게시물 조회·권한 확인·ActivityPub projection 중 Media Storage Service를 호출하지 않는다.
- Uploading 행에는 공개 표현 metadata가 아직 없을 수 있다.
- thumbnail·변환본과 Remote Media 표현 관리는 추가하지 않는다.

**Verification**

- additive migration과 새 업로드 완료 시 URL·Media Type·Ready 상태의 원자 저장을 확인한다.
- Media Storage Service의 미완료·오류·잘못된 응답에서 Ready 전환과 metadata 저장이 함께 거부되는지 확인한다.
- 완료 재호출과 동시 호출이 idempotent한지 확인한다.

- [x] 3.1 URL·Media Type nullable column과 additive migration을 추가한다.
- [x] 3.2 업로드 완료 결과 검증과 Ready 전환·metadata 원자 저장 및 idempotency를 구현한다.
- [x] 3.3 관련 core/API check와 strict OpenSpec 검증을 통과시킨다.

## 4. PROD-559 최초 Local Note Media 표현

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- PROD-461
- PROD-581
- PROD-559

**Deliverable**

Media가 있는 새 Local Post의 Note HTML, ordered attachment Image, Alt Text와 Sensitive Media가 역참조와 최초
Create delivery에서 동일하게 제공된다.

**Guardrails**

- Media node를 HTML `<img>`와 attachment에 중복 제공하지 않는다.
- internal Media UUID/global ID/storage reference와 upload URL을 ActivityPub에 노출하지 않는다.
- Media가 없거나 제공 불가능하면 partial Note를 만들지 않는다.
- 기존 Post 수정과 `Update(Note)` delivery를 추가하지 않는다.

**Verification**

- paragraph/link와 Media 혼합 document의 safe HTML과 attachment 순서를 확인한다.
- public WebP URL, media type, nullable Alt Text와 sensitive true/false를 확인한다.
- missing/non-Ready/누락·잘못된 저장 표현의 미제공 결과와 내부 identity 비노출을 확인한다.
- Media 없는 Local Note와 최초 Create delivery가 회귀하지 않는지 확인한다.

- [x] 4.1 current PostContent Media를 검증해 ActivityPub Image에 필요한 저장된 공개 표현으로 projection한다.
- [x] 4.2 Media node를 제외한 HTML과 ordered attachment/sensitive를 Local Note 역참조 및 최초 delivery에 연결한다.
- [x] 4.3 federation projection·권한·회귀 검증과 관련 Fedify check를 통과시킨다.

## 5. PROD-461 통합 검증과 archive

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- `docs/design/accessibility.md`
- PROD-461
- PROD-554
- PROD-553
- PROD-581
- PROD-559

**Deliverable**

이미지 선택부터 Ready Media가 포함된 새 Post 작성과 최초 ActivityPub Note까지 전체 결과가 검증되고
canonical·Linear·OpenSpec이 일치한다.

**Guardrails**

- 구현 자식 하나의 완료만으로 부모나 OpenSpec을 완료·archive하지 않는다.
- 독립 Backlog인 기존 Post 수정이나 `Update(Note)`를 이 change의 완료 조건으로 가져오지 않는다.
- `PROD-435` Local Media 업로드 change의 active delta를 먼저 정합화·archive해 stale root spec 충돌을 남기지 않는다.
- 실제 외부 upload 자격증명이나 signed URL을 저장소·로그·fixture에 보존하지 않는다.

**Verification**

- 실제 browser 방식의 발급 → PUT → 완료 → Post 작성 → document 조회 → Local Note projection을 확인한다.
- Web/iOS/Android의 최대 4개·상태·접근성 결과와 실행하지 못한 runtime 검증을 구분해 기록한다.
- core/API/app/Fedify tests, schema/Relay, TypeScript, ESLint, Prettier, syncpack, strict OpenSpec과 diff check를 통과시킨다.

- [ ] 5.1 네 구현 자식 결과를 실제 direct upload, 새 Post 작성과 Local Note 흐름으로 통합 검증한다.
- [ ] 5.2 canonical·Linear·OpenSpec과 GraphQL/Relay schema를 재대조하고 전체 정적·테스트 검증을 통과시킨다.
- [ ] 5.3 네 구현 자식과 부모 완료 조건을 확인하고 delta spec을 동기화한 뒤 change를 archive한다.
