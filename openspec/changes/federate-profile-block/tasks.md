## 1. PROD-818 구현 착수 기준 확인

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0029-profile-block-federation.md`.
- PROD-818의 선행 조건·명세·검증 소유권, PROD-813의 로컬 통합 검증·archive 책임.

**Deliverable**

승인된 연합 계약과 완료된 로컬 차단 기능을 근거로 구현을 시작할 수 있다. 이후 모든 group은 이 결과에 의존한다.

**Guardrails**

- D6에 따른 PROD-813 선행 조건은 D8의 사용자 명시 면제로 이번 구현 세션에서 적용하지 않는다. 이 면제는 PROD-813의 구현·통합 검증·archive 완료를 뜻하지 않는다.
- PROD-818은 자기 연합 change만 소유하며 PROD-813의 local change를 대신 archive하지 않는다.

**Verification**

- 최신 Linear 본문·관계·계약 댓글, 승인된 artifact digest와 PROD-813의 통합 검증 revision을 대조한다.
- 2026-09-10에는 PROD-813 Done과 PROD-822·PROD-823 In Review가 함께 관측됐다. 실제 병합·검증 증거를 확인하며, 후속 신규 UI 교체 PROD-917을 추가 선행 조건으로 삼지 않는다.
- 그 revision의 core action·cleanup·policy·dispatcher·Worker registry를 직접 읽어 현재 설계와 차이를 기록한다.

- [x] 1.1 Spec Gate 승인과 PROD-813 선행 조건 면제 지시를 확인하고, 현재 local baseline을 PROD-818 구현 기준으로 기록한다.
- [x] 1.2 최종 공통 Block action과 cleanup 경계를 확인하고 계약 변화가 있으면 canonical·Linear부터 정렬한다.

## 2. PROD-818 원본 identity와 복구 가능한 관계 적용

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`의 관계·행동·Owner 권한,
  `docs/domain/decisions/0029-profile-block-federation.md`의 단일 관계·rollout.
- PROD-818의 verified inbound·멱등성·순서 역전·재시도·상태 보존 범위.

**Deliverable**

Block 원본과 해제를 구분하며 중복·completion loss에도 같은 domain 관계와 미완료 효과로 수렴한다. group 1에 의존한다.

**Guardrails**

- D1·D3·D4·D5: pair당 제품 관계는 하나, 여러 원본은 protocol metadata, 마지막 미해제 원본만 canonical 해제로 연결한다.
- 기존 action·cleanup을 복제하지 않고 exact row를 보존한다. generic ledger·임의 TTL·새 exactly-once framework는 제외한다.
- 저장 변경은 구버전과 호환되는 additive 변경으로 한정하고 기존 migration을 수정하지 않는다.

**Verification**

- 실제 DB에서 원본 중복·ID 내용 충돌·Undo 선행·B2→B1→Undo B1·마지막 원본 해제·반대 방향 Block을 검증한다.
- domain commit 직후 응답 유실과 새 row 생성 후 과거 효과 재시도를 주입해 관계와 effect 결과를 확인한다.
- 저장 변경이 있으면 구버전 read/write·기존 row 유지·forward migration 재실행 결과를 검증한다.

- [x] 2.1 검증 원본·종료 증거·exact row와 미완료 효과를 보존하는 최소 경계를 구현한다.
- [x] 2.2 원본별 종료와 마지막 원본의 canonical cleanup·해제를 연결하고 completion-loss 복구를 검증한다.
- [x] 2.3 필요한 additive migration과 old/new 호환 검증을 수행한다. 저장 변경이 없으면 그 근거를 남긴다.

## 3. PROD-818 verified inbound Block·Undo

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`의 ingress·Owner·cleanup,
  `docs/domain/objects/profile.md`의 Origin, `docs/domain/objects/instance.md`의 원격 요청 정책.
- PROD-818의 verified inbound·보안·origin 구분·echo 방지 범위.

**Deliverable**

인증된 Remote Owner가 자기 방향의 Local Target 차단만 생성·해제한다. group 2에 의존한다.

**Guardrails**

- D1·D3: signature, actor, 원본 ID, object, personal/shared inbox 검증을 모두 통과한다.
- 일반 Block 조회 제한 때문에 Owner의 정상 Undo가 막히지 않게 하며 공개 조회 권한을 새로 부여하지 않는다.
- URI-only 원본은 기존 안전한 loader·admission으로 확인하고 미검증 입력에서 mutation하지 않는다.
- inbound Block/Undo echo를 막되 기존 Follow cleanup 효과와 다른 Undo 종류를 보존한다.

**Verification**

- 실제 inbox 요청으로 성공·잘못된 서명·actor/object 바꿔치기·personal inbox 불일치·잘못된 Local Instance를 검증한다.
- embedded·저장 원본 IRI·미확인 IRI, cleanup 실패·재시도, 반대 방향 유지와 Follow 비복구를 확인한다.
- 등록된 기존 Follow·Like·EmojiReact Undo 경로의 실행 회귀를 확인한다.

- [x] 3.1 Block listener와 Undo 분기를 기존 인증·recipient·원본 검증 경계에 연결한다.
- [x] 3.2 ActivityPub-origin을 공통 action과 효과에 전달하고 echo 0건·필수 cleanup을 검증한다.
- [ ] 3.3 잘못된 입력과 URI-only·embedded 원본의 실제 처리 결과를 검증하고 기존 Undo 회귀를 통과시킨다.

## 4. PROD-818 대상 한 명에 대한 Block·Undo 발신

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`의 연합·실패 경계,
  `docs/domain/objects/instance.md`의 새 원격 요청 정책,
  `docs/domain/decisions/0029-profile-block-federation.md`의 Mastodon 호환 결정.
- PROD-818의 발신·queue/dispatcher 재사용·retry·origin 범위와 2026-09-10 구두 결정 기록(댓글 `273992ef-16f2-4ade-a655-fa7b1457c3b0`).

**Deliverable**

새 Local → Remote 차단과 해제를 안정적인 원본으로 Target에게만 전달한다. group 2에 의존한다.

**Guardrails**

- D2·D4·D7: 기존 dispatcher·Fedify queue를 재사용하고 explicit direct-only와 caller orderingKey를 보존한다.
- Public·followers·제삼자 전달, local Target 발신, inbound echo를 허용하지 않는다. 기존 caller audience는 유지한다.
- required cleanup 완료 후 효과를 처리하며 queue/remote 실패가 로컬 결과를 rollback하지 않는다.

**Verification**

- 실제 recipient 확장 결과와 캡처한 Activity의 ID·actor·object·audience·orderingKey를 검사한다.
- Target이 아닌 followers가 존재해도 0건 전달되는지, 기존 Post·Reaction recipient 결과가 유지되는지 확인한다.
- 원본 삭제 후 Undo retry, Workflow의 B1→Undo B1→B2 효과 처리 순서, queue 수락 응답 유실과 policy 제외를 검증한다.
- B1 인계 응답 유실 중 Undo가 대기하는지, 정산된 B1의 재호출이 Undo 뒤에 재인계되지 않는지,
  retry 소진 시 선두 실패와 뒤 효과 대기가 보존되는지 확인한다.
- unavailable 후 복구·계속 unavailable·잘못된 URI·mapping 부재 각각에서 queue 호출 수, pending 사유와 후속 Undo 대기를 검사한다. 미인계 정상 no-op과 실제 수락을 같은 성공으로 처리하지 않는지 확인한다.
- 이전 attempt가 살아 있어도 후속 attempt의 실제 수락을 확인·보존하면 Undo가 진행되는지 Workflow 결과로 확인한다. 이전 attempt 종료 증명이나 원격 retry 완료를 기다리는 새 조건을 추가하지 않는다.
- 응답 유실과 pending 상태 Worker restart에서 같은 원본과 로컬 결과를 보존한다. 원격 순서 보장이나 두 Worker·INSERT barrier 실험은 필수 완료 조건이 아니다.

- [x] 4.1 Block·Undo의 안정적인 ID·원본 snapshot과 origin별 발신 효과를 연결한다.
- [x] 4.2 dispatcher에 대상 한 명과 orderingKey를 보존하는 경로를 마련하고 기존 caller 회귀를 검증한다.
- [ ] 4.3 순차 queue 인계·인계 실패 복구·인계 후 Fedify retry와 로컬 결과 격리를 검증한다.
- [ ] 4.4 공통 dispatcher의 실제 인계·recipient 제외 결과를 구분하고 확정 후 unavailable은 pending·Undo 대기로 정산한다. 기존 Post·Profile Update의 정상 no-op·audience·오류와 Reaction·Repost 기존 경로를 보존한다.
- [ ] 4.5 D7에 따라 실제 queue 수락 정산 후 이전 attempt 생존 가능성만으로 Undo를 보류하지 않는지 검증한다. stable identity와 로컬 상태 보존을 확인하며 remote-visible ordering 보장은 검증 완료 조건에서 제외한다.

## 5. PROD-818 비소급 rollout과 Worker 복구

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`의 rollout·실패 경계,
  `docs/domain/decisions/0029-profile-block-federation.md`의 기존 차단 처리.
- PROD-818의 2026-09-08 rollout 결정과 Worker restart·실패·재시도 범위.

**Deliverable**

기존 차단을 소급 발신하지 않고, 재시작·rollback 뒤에도 관계와 미완료 효과가 보존된다. group 3·4에 의존한다.

**Guardrails**

- D3·D4·D5: 발신 자격이 없는 기존 row에 원본을 backfill하지 않고 그 해제에는 Undo를 만들지 않는다.
- 새 DB/Worker 수용을 준비한 뒤 admission을 활성화한다. rollback은 기존 관계·원본 종료 증거를 삭제하지 않는다.
- process-local mock이나 Workflow 코드 문자열 검사를 실제 persistence·restart 증거로 대신하지 않는다.

**Verification**

- 기존 차단이 있는 상태의 배포, 구버전 row 생성, 해제 후 재차단의 DB 상태와 Activity 0건/새 Block 결과를 확인한다.
- production registry와 실제 Temporal/PostgreSQL queue에서 cleanup 중단, queue 인계 전후 Worker·consumer 재시작을 검증한다.
- 새 admission 중지와 호환 Worker drain 후 원본 identity·pending effects·로컬 조회 결과를 비교한다.

- [ ] 5.1 기존/신규 차단 발신 자격과 기존 차단 해제·재차단 rollout을 검증한다.
- [ ] 5.2 production registry로 Worker bundle·history 호환과 Temporal·Fedify consumer 재시작을 검증한다.
- [ ] 5.3 새 admission 중지·진행 중 효과 정산·rollback 후 상태 보존 절차와 실행 증거를 기록한다.

## 6. PROD-818 protocol·회귀·대표 연합 E2E

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`의 관계·cleanup·조회·해제,
  `docs/domain/decisions/0029-profile-block-federation.md`의 상호운용 범위.
- PROD-818의 완료 조건·protocol·회귀·대표 연합 E2E 소유권.

**Deliverable**

승인된 모든 연합 시나리오와 기존 로컬 차단 회귀를 실행 결과로 확인한다. group 3·4·5에 의존한다.

**Guardrails**

- D1~D5: 같은 관계 재사용·Owner 방향·원본 identity·대상 한정·echo 방지·실패 격리·비소급 rollout을 모두 확인한다.
- 테스트는 요청·출력·DB 상태·전달 Activity·failure path를 검사한다. 소스·설정 문자열 검사로 대체하지 않는다.
- 실제 검증한 서버 버전과 revision을 기록하고 remote HTTP 수락과 정책 적용을 구분한다.
- Profile 기본정보, A→B 직접 콘텐츠 조회, B→A·mutual Block 콘텐츠 제한과 양방향 타임라인·검색 필터링을 구분해 검증한다.

**Verification**

- 현재 확인한 명령은 `pnpm --filter @kosmo/core test:services`, `pnpm test:fedify`,
  `pnpm --filter @kosmo/worker test`, `pnpm --filter @kosmo/worker build`다. 착수 revision의 script와 새 테스트 포함 여부를 재확인한다.
- Local→Local 무발신, Kosmo→Mastodon Block/Undo, Mastodon→Kosmo Block/Undo, 양방향 Block 공존,
  duplicate·out-of-order·실패 서버·restart·기존 row rollout을 실행한다.
- 필요한 경우 격리된 두 Kosmo Instance fixture로 전달 내용을 검증하고 실제 Mastodon 상호운용 결과와 구분한다.

- [ ] 6.1 모든 spec scenario의 실행 증거와 요구사항 대응표를 만들고 관련 core·Fedify·Worker 검증을 통과시킨다.
- [ ] 6.2 실제 Mastodon 버전의 양방향 Block/Undo와 로컬 제한·해제 후 Follow 비복구를 확인한다.
- [x] 6.3 기존 로컬 차단·Follow cleanup·다른 Undo·기존 recipient dispatcher 회귀를 확인한다.

## 7. PROD-818 연합 change 동기화·archive

**Authority / Provenance**

- `docs/domain/decisions/0029-profile-block-federation.md`의 책임 경계.
- PROD-818의 명세·검증 소유권과 전체 완료 조건, PROD-813의 별도 local change 책임.

**Deliverable**

PROD-818 전체 범위의 완료 증거와 최종 명세가 일치한다. group 1~6 전체 완료에 의존한다.

**Guardrails**

- D6: 개별 PR Ready·merge만으로 archive하지 않는다. canonical·Linear·delta spec을 독립 대조한다.
- 미실행 검증과 남은 task가 있으면 완료·archive를 선언하지 않는다. 현재 Spec 세션에서는 이 group을 실행하지 않는다.

**Verification**

- `openspec validate federate-profile-block --strict`, 요구사항별 실행 증거와 전체 task 완료를 확인한다.
- delta sync·archive 후 `openspec validate --specs --strict`를 실행하고 생성된 최종 spec을 대조한다.

- [ ] 7.1 전체 scope·canonical·Linear·실행 결과를 대조하고 현재 구현과 다른 명세를 정렬한다.
- [ ] 7.2 전체 검증 후 delta sync·archive와 archive 후 validation을 수행하고 PROD-818 완료 증거를 남긴다.
