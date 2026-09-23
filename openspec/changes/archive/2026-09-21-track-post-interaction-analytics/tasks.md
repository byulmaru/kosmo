이 checklist는 PROD-539의 구현·검증을 위한 세션 메모다. 최신 main의 PostHog 기반을 사용하고 수집 중단은 유지한다. OpenSpec 승인·archive를 추가 완료 조건으로 두지 않으며 실제 수집 증거가 없는 항목은 pending으로 남긴다.

## 1. PROD-539 이벤트와 명시적 속성

**Authority / Provenance**

- `docs/domain/objects/account.md`, `docs/domain/objects/reaction.md`
- [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·개인정보 경계
- [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 typed custom event·identity·fail-open·Native no-op 계약

**Deliverable**

다섯 이벤트가 기존 PostHog Account identity와 analytics 경계를 사용하며 명시적 속성은 허용 값만 포함한다.

**Guardrails**

- 재게시 `result: created | removed`, 반응 `reaction_type: default | custom`, 북마크 무속성을 유지한다.
- `❤️`만 default다. 나머지 다섯 Type과 향후 별도 기본 반응으로 승인되지 않은 Type은 custom이다.
- Account·Post·Profile ID, 콘텐츠, 구체 emoji·custom emoji 식별 정보, 오류 원문·직접 식별 trait를 명시적 속성에 넣지 않는다.
- SDK 표준 metadata, identity와 Native no-op을 보존한다. 수집 재개나 Cloud 설정을 포함하지 않는다.

**Verification**

- 이벤트별 타입 오류와 실제 capture 인자를 각각 확인한다. 북마크 호출의 추가 property도 검사한다.
- 설정 누락·SDK 초기화 및 capture 실패에서 제품 흐름과 Native no-op이 유지되는지 실행한다.

- [x] 1.1 기존 event 계약에 다섯 이벤트와 허용 속성을 추가한다.
- [x] 1.2 현재 여섯 Type 분류, 타입 제한과 전송 속성을 검증한다.
- [x] 1.3 분석 장애 격리와 Native no-op 회귀를 확인한다.

## 2. PROD-539 서버 확정 성공 연결

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`
- `docs/design/post-action-bar.md`, `docs/design/reactions.md`
- [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 성공 경계·Account 귀속·완료 조건

**Deliverable**

task 1의 이벤트를 실제 mutation 성공 결과마다 한 번 호출한다. 실패·성공 payload 부재·network 오류는 수집하지 않는다.

**Guardrails**

- mutation 연결, Relay 정규화, actor 격리, pending·오류 처리와 성공 의미를 유지한다.
- Reaction의 부분 오류·멱등 성공, Bookmark 삭제의 요청 대상 확인 판정을 보존한다.
- 메뉴 열기·클릭·차단된 입력·optimistic state·재렌더링은 성공 이벤트가 아니다.
- 공용 analytics identity 수명주기를 재구현하거나 이벤트 property로 identity를 우회하지 않는다.

**Verification**

- 실제 action·hook을 실행해 여섯 성공 동작의 이름·속성·호출 횟수와 Relay Store·UI 결과를 관찰한다.
- null payload, 잘못된 삭제 대상, GraphQL·network 오류, 도달 가능한 부분 응답, Reaction 멱등 삭제와 SDK 실패를 재현한다.
- 중복 입력·재렌더링과 actor A→B 전환 후 UI·Store 격리를 검증한다.

- [x] 2.1 재게시 생성·취소 성공에 대응 result를 가진 이벤트를 연결한다.
- [x] 2.2 반응 추가·삭제 성공에 Type 분류만 담은 이벤트를 연결한다.
- [x] 2.3 북마크 추가·삭제 성공에 무속성 이벤트를 연결한다.
- [x] 2.4 실제 호출부의 성공·실패·중복·부분 응답과 UI·Store 회귀를 검증한다.

## 3. PROD-539 문서와 기능별 수집 검증

**Authority / Provenance**

- [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 운영 문서·계측 gap·완료 조건
- [PROD-795](https://linear.app/byulmaru/issue/PROD-795)의 공유 운영 책임
- `memory/issue-openspec-workflow.md`의 하네스와 실제 완료 범위 구분

**Deliverable**

운영 문서가 이벤트 목록·검증 방법·계측 한계를 설명하고, 자동 검증과 실제 PostHog 수집 증거를 구분해 기록한다.

**Guardrails**

- Account 가입 이벤트·가입 대용 이벤트·집계식을 추가하지 않는다. Canceled PROD-520을 집계 승인으로 취급하지 않는다.
- 실제 Account ID·사용자 콘텐츠·인증정보를 증거에 복사하지 않는다.
- 실제 수신이 미확인인 항목을 mock 성공으로 완료 처리하지 않는다. 수집 재개와 공유 production acceptance는 별도 책임이다.
- archive는 선택적 정리이며 구현·PR 완료 gate가 아니다.

**Verification**

- `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/app test:unit`, 관련 Storybook interaction, 변경 파일 lint·format과 `pnpm --filter @kosmo/app export:web`을 실행한다. 실제 수정 범위에 따라 필요한 Web E2E를 추가 선택한다.
- 격리된 브라우저 전송 검증과 승인된 환경의 실제 PostHog 수신에서 Account 귀속·성공/취소·실패 비수집을 확인한다. 외부 환경이 준비되지 않았다면 미확인 범위와 남은 책임을 기록한다.
- 가입 이벤트 부재, 멱등·추가/제거 횟수와 순사용의 차이, 집계 owner 공백을 기록한다.

- [x] 3.1 최신 PostHog 운영 문서에 명시적 이벤트 목록·검증 절차·계측 gap을 반영한다.
- [x] 3.2 관련 자동 검증을 실행하고 결과를 이 세션 하네스의 문서 검증과 구분해 남긴다.
- 실제 PostHog 수집·Account 귀속·실패 비수집 확인은 이 구현 하네스의 task가 아니라 별도 production acceptance다. 미확인 조건과 남은 책임은 PR 본문과 PROD-575 handoff에 보존한다.
