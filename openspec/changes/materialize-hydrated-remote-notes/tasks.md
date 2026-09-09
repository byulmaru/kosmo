## 1. PROD-509 선행 결과와 구현 경계 확인

**Authority / Provenance**

- `docs/architecture/core-services.md`, PROD-509 최소 helper 흡수 결정, PROD-465 완료 기준, 사용자 스택 결정(2026-09-09).

**Deliverable**

PROD-509가 소비할 기존 production helper와 10,000자 수신 한계, 구현 부모의 실제 상태를 확인한다.

**Guardrails**

PROD-465 선행 기능 구현을 509로 가져오거나 미완료를 완료로 간주하지 않는다. main에서 준비한 스펙을 선행 결과가 모두 포함된 부모 위에 연결한다. OpenSpec Gate 승인 전에는 구현하지 않는다.

**Verification**

선행 코드·검증 결과, 부모 SHA와 ancestry, official `gh stack view --json`을 확인한다. 원격 제출 뒤 PR head/base/stack도 확인한다.

- [x] 1.1 기존 content/media/createPost 및 audience·Parent 공유 범위와 PROD-465의 10,000자 한계 구현 증거를 확인하고 현재 스펙과 대조한다.
- [x] 1.2 사용자 결정과 OpenSpec Gate 승인을 확인하고 PROD-465 결과를 포함한 구현 스택에 연결한다.

## 2. PROD-509 원문 identity와 작성자 확인

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, PROD-509의 요청 IRI·typed Note·attribution·작성자 검증, PROD-248 Actor 정책, 2026-09-09 최소 helper 재사용 결정.

**Deliverable**

원문의 exact identity와 attributed author를 검증해 허용된 Note만 공통 저장 경계에 전달한다. 1그룹 완료 뒤 진행한다.

**Guardrails**

기존 Fedify hydration을 사용하고 일반 projection을 복제하지 않는다. 신규 경로의 PUBLIC/UNLISTED 제한·Reply/Media 허용·완전 empty 거부를 기존 Create의 허용 범위와 구분한다. Note content/media 등 검증과 수신 한계 확인은 신규 author persistence보다 먼저 완료한다. public callback/evaluator로 검증을 우회하지 않는다.

**Verification**

same/different delivery actor, exact/mismatched object ID, absent/multiple/non-HTTP(S) attribution, stored/unknown/unusable author, Local/handle collision과 지원 범위 밖 Note를 검증한다.

- [x] 2.1 기존 content/media helper와 필요한 최소 audience·Reply helper를 재사용하는 원문 materialization 경계와 consumer별 production 검증을 제공한다.
- [x] 2.2 exact URI로 저장된 작성자를 재사용하고 미저장 작성자의 기존 lookup·projection·충돌 검증을 연결한다. 실제 Actor URI와 Note attribution의 exact 일치를 persistence 전에 검증하는 최소 수정을 포함한다.
- [x] 2.3 성공·identity 대체·작성자 실패·지원 범위 거절을 실제 경계에서 검증한다.

- [x] 2.4 `inReplyTo` 해석·DB Parent lookup 및 Parent-specific null fallback 중 필요한 최소 로직을 공유하고 Parent fetch·재귀 materialization이 없는지 검증한다.
- [x] 2.5 Public/Unlisted × Reply 여부, 저장된 Local/Remote Parent, unknown/malformed/ambiguous/non-HTTP(S)/contentless Parent 및 lookup 뒤 Parent-specific 실패를 검증한다. DB 장애·예상하지 못한 오류의 전파와 fallback 미실행도 검증한다.
- [x] 2.6 Reply Source와 Parent의 author·audience가 다른 경우 Source 자체가 저장되는지, duplicate/concurrent 입력이 기존 null Parent를 갱신하지 않는지 검증한다. raw `inReplyTo` 미보존 한계와 PROD-506 후속 범위를 인계한다.

- [x] 2.7 지원/비지원/IRI-only attachment와 앞 4개 규칙, 잘못된 다섯 번째 무시, 같은 URL별 별도 identity와 nullable metadata 보존을 검증한다.
- [x] 2.8 선택된 Media 하나의 필수 검증 실패에서 전체 Note 거부와 Post 미생성을 검증한다. attachment-only 성공, 본문·유효 이미지가 모두 없는 신규 Note 거부와 content/media 검증 실패 시 author persistence 미시작도 확인한다.
- [x] 2.9 Actor exact URI 불일치 시 persistence 전에 거부해 잘못된 Actor/Post가 생성되지 않고 기존 Profile이 재연결되지 않는지 검증한다.

## 3. PROD-509 원자적 저장과 중복·effects

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-509 원자성·concurrent first materialization·first-write-wins 완료 기준.

**Deliverable**

기존 Actor와 Post의 독립된 원자적 저장 경로를 사용하고 object URI마다 하나의 Post로 수렴한다. 2그룹의 identity 검증 뒤 진행한다.

**Guardrails**

Post/PostContent/currentContent/mapping/첨부 Media/최초 Reply Parent의 원자성과 first-write-wins를 보존한다. 작성자 identity 불일치 또는 충돌로 partial row를 남기지 않는다. 성공한 Post commit 뒤 effects를 시작하고 rollback/duplicate에서는 시작하지 않는다. 새 revision·Tombstone 부활·별도 Post 저장 엔진·durable receipt를 추가하지 않는다.

**Verification**

real DB에서 각 저장 단계의 강제 실패와 재시도, 같은 object의 병렬 호출 및 Create와의 경합을 실행한다. 기존 row와 이번 호출이 만든 row를 구분해 검증한다. 일반 Temporal no-op test client만으로 commit/start 순서를 증명하지 않고 start 관측 또는 기존 runtime seam으로 검증한다.

- [x] 3.1 Actor/Profile·Profile 표현과 Post를 독립 transaction으로 저장하고 Instance 확보도 기존 독립 경계를 유지한다. author+Post 전체 transaction API를 만들지 않는다. 기존 `createPost`의 원자성·중복 처리와 Post commit 뒤 effects를 연결한다.
- [x] 3.2 Actor 내부 저장 실패는 해당 Profile/Actor/Profile 표현을 rollback하는지 검증한다. 유효 Actor commit 후 Post DB 실패에서는 Actor·Profile 표현·Instance가 보존되고 Post·Content·mapping·첨부 Media·Parent 관계만 rollback되는지 검증한다. 오류 전파와 작성자 보상 삭제 없음도 확인한다.
- [x] 3.3 rollback/duplicate의 effects 미시작, commit 뒤 start, start 실패 후 committed 결과 보존과 ActivityPub echo suppression을 검증한다.

- [x] 3.4 duplicate/concurrent materialization에서 Actor/Post identity가 수렴하고, 패배한 Post 시도의 첨부 Media가 남지 않으며 다른 요청이 사용하는 Actor를 보상 삭제하지 않는지 검증한다. 재시도에서 유효 Actor를 재사용하는지도 확인한다.

## 4. PROD-509 Create 전환과 budget 통합 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, PROD-509 첫 production consumer·resource budget, PROD-509가 흡수한 기존 Create 회귀, PROD-465 완료 기준.

**Deliverable**

기존 Create가 공통 action을 사용하면서 기존 결과를 유지하며 두 경로 모두 선행 budget을 적용한다. 2·3그룹 완료 뒤 진행한다.

**Guardrails**

저장된 delivery actor와 attribution 일치, Reply Parent fallback, Followers Only relevance, Media를 보존한다. 신규 조회는 PUBLIC/UNLISTED Reply도 허용하되 private 허용이나 별도 Media 정책을 추가하지 않는다. 신규 empty 거부를 기존 Create에 일괄 적용하지 않는다. DB 장애·예상하지 못한 오류는 fallback으로 삼지 않는다. budget 수치·loader를 별도로 만들지 않는다.

**Verification**

Public/Unlisted/Followers Only, extra audience URI, Reply Parent 성공·미해석, 정상·거절 Media, unknown/mismatched delivery actor를 회귀 검증한다. embedded/IRI 각각 정규화한 summary/body Plain Text 합계 9,999/10,000/10,001자(UTF-16 `.length`)의 저장과 전체 no-op을 확인한다.

- [x] 4.1 기존 Create를 공통 materialization action의 첫 production consumer로 전환한다.
- [x] 4.2 기존 Create의 정상·거절·Reply·Followers Only·Media 저장 결과를 회귀 검증한다.
- [x] 4.3 선행 10,000자 제한의 두 경로 통합 적용과 초과 입력의 no-op을 검증한다.

## 5. PROD-509 인계와 change 완료

**Authority / Provenance**

- `docs/architecture/core-services.md`, PROD-509 전체 전달 결과·제외 범위, `memory/issue-openspec-workflow.md`의 완료 책임.

**Deliverable**

PROD-509가 공통 경계·Create의 통합 완료 증거를 남기고 이 change의 정합성 확인과 archive를 소유한다. 1~4그룹 완료 뒤 진행한다.

**Guardrails**

후속 Announce/Quote/signed-fetch 구현을 이 change의 task로 추가하지 않는다. PR Ready와 전체 change archive는 별도로 판정한다. 기존 GraphQL DB-only 조회와 authorization을 보존한다.

**Verification**

기본 실행 후보는 `pnpm test:fedify`, `pnpm --filter @kosmo/core test:services`, 영향 패키지의 `lint:tsc`와 `openspec validate materialize-hydrated-remote-notes --strict`다. 구현 diff가 core/Post effects를 변경하면 해당 runtime 검증을 포함하고 실제 실행 명령·결과·미실행 항목을 남긴다.

- [x] 5.1 관련 Fedify/core 검증과 영향 패키지 정적 검증을 통과시키고 DB-only 조회·authorization 보존 증거를 남긴다.
- [ ] 5.2 후속 consumer에 입력·결과·거절·원자성·budget 계약과 Create 회귀 증거를 인계한다.
- [ ] 5.3 전체 scope·tasks·strict validation을 확인하고 delta 동기화 및 이 change의 archive를 수행한다.
