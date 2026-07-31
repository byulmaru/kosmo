## 1. PROD-598 GraphQL 작성자 삭제 경계

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `PROD-598`

**Deliverable**

GraphQL `deletePost`가 검증된 selected Profile과 concrete Post ID를 기존 Core 삭제 service에 전달하고 삭제된 Post의 global `postId`를 반환한다.

**Guardrails**

- 기존 Core/DB 삭제 lifecycle과 GraphQL schema shape를 재구현하거나 변경하지 않는다.
- 현재 resolver와 test가 이미 계약을 충족하면 중복 backend source나 test를 추가하지 않고 검증 증거로 완료한다.

**Verification**

- Author 성공, 비Author·guest 거부, Post가 아닌 global ID 거부, target global `postId` payload와 대상 Post 상태를 API integration에서 확인한다.
- 기존 resolver가 현재 Core service를 한 번 호출하는 경계와 관련 type/schema check를 확인한다.

- [ ] 1.1 현재 GraphQL resolver와 API integration coverage를 계약에 대조하고 누락된 resolver behavior만 최소 구현한다.
- [ ] 1.2 Author·비Author·guest·잘못된 concrete ID와 global `postId` 결과를 검증하고 backend 경계 증거를 기록한다.

## 2. PROD-598 작성자 More menu와 삭제 확인

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `docs/design/accessibility.md`
- `PROD-598`

**Deliverable**

작성자는 Home·Profile 목록과 상세의 Action Bar 케밥 More menu에서 자신의 Active contentful Post 삭제를 선택하고 접근 가능한 확인 UI에서 실행 여부를 결정할 수 있다.

**Guardrails**

- guest·다른 Profile·Tombstone·Content 없는 Repost에는 삭제 item을 표시하지 않는다.
- 순수 Repost surface는 direct Source를 삭제 target으로 사용하고 바깥 Repost 취소는 기존 Repost menu에 남긴다.
- 링크 복사가 함께 있으면 삭제를 마지막 danger item으로 두며, menu 선택만으로 mutation을 시작하지 않는다.
- 확인 copy, 초기 취소 focus, pending 중 action·dismiss 차단과 Web·Native modal semantics를 유지한다.
- More menu의 target·mutation 상태는 private child가 소유하고 Action Bar container는 고정 순서와 control 조립 책임을 유지한다.

**Verification**

- 일반 Post·Reply·Quote·Reply이면서 Quote, guest·다른 Profile, pure Repost Source와 링크 복사 item 순서를 component/Storybook fixture로 확인한다.
- menu open·dismiss·focus return, 확인 copy·cancel·confirm, Web keyboard/Escape, Native back/backdrop와 pending busy·disabled 상태를 검증한다.

- [ ] 2.1 작성자 eligibility와 direct Source target을 파생하는 private More action을 기존 ActionMenu와 Action Bar에 연결한다.
- [ ] 2.2 기존 item과 호환되는 destructive menu 표현과 승인된 copy·focus·dismiss·pending semantics의 삭제 확인 UI를 구현한다.
- [ ] 2.3 작성자별 노출, item 순서, 정확한 target ID, 취소·확인·중복 입력과 Web·Native 접근성 component/Storybook 검증을 추가한다.

## 3. PROD-598 서버 성공 기반 Relay 동기화와 실패 복구

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `docs/design/accessibility.md`
- `PROD-598`

**Deliverable**

사용자가 확인한 삭제가 서버에서 성공하면 현재 selected Profile의 Home·Profile 목록과 상세가 삭제 결과를 반영하고, 실패·취소에는 기존 Post와 cache를 유지한 채 재시도할 수 있다.

**Guardrails**

- server 성공 전에 target record나 connection을 optimistic 삭제하지 않는다.
- 성공 payload의 `postId`를 기준으로 요청을 시작한 actor Store만 갱신하고 다른 selected Profile Store는 변경하지 않는다.
- current surface의 direct Post, reply thread entry와 pure Repost Source representation에 Active content가 남지 않게 한다.
- 실패에는 dialog를 재시도·취소 가능한 상태로 복구하고 승인된 한국어 문구를 공용 alert toast로 표시한다.
- Repost 생성·취소와 다른 Post action의 상태·pending·cache 의미를 변경하지 않는다.

**Verification**

- Home·Profile 목록, 상세, reply thread와 pure Repost Source success payload를 각각 Relay environment test로 검증한다.
- server pending·GraphQL/network failure에는 cache 유지, dialog 복구, alert toast와 같은 ID 재시도를 검증한다.
- mutation 중 selected Profile 전환 fixture에서 이전 callback이 새 actor Store나 UI state를 바꾸지 않는지 확인한다.

- [ ] 3.1 확인 뒤 정확한 Post ID로 단일 mutation을 실행하고 actor 전환에 안전한 성공·실패 callback 경계를 구현한다.
- [ ] 3.2 payload `postId` 기반으로 현재 actor Store의 목록·상세·pure Repost representation을 server 확정 상태에 맞추고 성공 UI를 종료한다.
- [ ] 3.3 실패 cache 유지·dialog 재시도·한국어 alert toast와 Home·Profile·상세·actor 격리 Relay test를 구현한다.

## 4. PROD-598 통합 검증과 완료 증거

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `docs/design/accessibility.md`
- `PROD-598`

**Deliverable**

PROD-598의 backend resolver 경계와 Web·Android·iOS 공용 삭제 흐름이 repository 검증을 통과하고, 기존 Post action 회귀 없이 독립적으로 review 가능한 완료 증거를 가진다.

**Guardrails**

- PROD-432의 링크 복사·전체 Action Bar 통합, 다른 More 항목, Core/DB/API schema 변경과 Native 출시 gate를 이 change의 완료로 주장하지 않는다.
- 구현에서 canonical 또는 Linear 계약과 충돌이 발견되면 canonical→Linear→OpenSpec 순서로 다시 정렬한다.

**Verification**

- Relay artifact 생성, app typecheck·lint, 관련 component/Storybook test와 API integration test를 통과시킨다.
- Web runtime에서 menu·alertdialog·keyboard focus와 목록·상세 결과를 확인한다.
- Repost 취소 및 인접 Action Bar action 회귀 검증과 `openspec validate add-author-post-deletion --strict`를 통과시킨다.
- 실행하지 못한 Native 실기기·VoiceOver·TalkBack 검증은 완료 증거와 분리해 기록한다.

- [ ] 4.1 Relay artifact와 관련 API·app component/Storybook·typecheck·lint 검증을 실행하고 발견된 범위 내 결함을 수정한다.
- [ ] 4.2 Web 목록·상세의 삭제 menu·확인·성공·실패와 기존 Repost/Action Bar 회귀를 통합 검증한다.
- [ ] 4.3 OpenSpec strict validation, 구현 diff, 미실행 Native runtime과 남은 위험을 handoff에 기록한다.
