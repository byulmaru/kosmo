## 1. PROD-938 공용 요약·필터·프로필 행

**Authority / Provenance**

`docs/design/reactions.md`의 요약 row·People route, `docs/domain/objects/reaction.md`, PROD-938.

**Deliverable**

요약에서 항상 People에 접근하고, 필터와 Bio 없는 Profile 행을 현재 시각·접근성 계약으로 사용한다.

**Guardrails**

서버 순서·count·기존 toggle/Follow 소유권을 보존한다. 6종 초과는 독립 UI Tests에서만 검증한다.

**Verification**

실제 컴포넌트로 width-fit·숨긴 Type 수·선택 보존·펼침/접기·Bio 숨김·행 구분선과 키보드 동작을 검증한다.

- [x] 1.1 한 줄 width-fit과 Ellipsis/+N 진입점을 구현한다.
- [x] 1.2 선택 상태를 보존하는 pill 필터와 공용 Profile 행을 정렬한다.
- [x] 1.3 수동 Playground와 관련 동작 Tests story를 정렬한다.

## 2. PROD-938 전용 화면과 조회 lifecycle

**Authority / Provenance**

`docs/design/reactions.md`의 People route, `docs/design/page-header.md`, `docs/domain/objects/reaction.md`, PROD-938.

**Deliverable**

전용 URL에서 올바른 Post/Type을 조회하고 Back·프로필 방문 복귀·오류 재시도·페이지네이션을 제공한다.

**Guardrails**

기존 shell·actor Environment·조회 권한을 유지한다. 필터 전환은 history를 늘리지 않으며 이전 Type/actor 행을 노출하지 않는다.

**Verification**

직접 진입·Type 정규화·Back fallback·최초/추가 오류·재시도·캐시 재방문·actor 전환의 최소 동작 테스트와 실제 화면 스토리.

- [x] 2.1 전용 route와 중복 없는 PageHeader·shell·scroll/focus 경계를 연결한다.
- [x] 2.2 기존 Relay 조회·페이지네이션·inline 재시도와 cache 격리를 연결한다.
- [x] 2.3 URL·선택·Back·실패 경로의 최소 자동 검증을 정렬한다.

## 3. PROD-938 실제 진입점과 통합 검증

**Authority / Provenance**

`docs/design/reactions.md`의 대상 Post·People 진입점·검증, PROD-938.

**Deliverable**

목록·상세·답글 알림·Wide Viewer에서 동일한 대상의 People 화면을 열고 복귀한다.

**Guardrails**

일반·Quote own Post와 순수 Repost source Post를 보존한다. Compact 새 노출·Full Picker·API 확장은 포함하지 않는다.

**Verification**

실제 route E2E로 진입·복귀·Viewer close/focus를 검증하고 app check·관련 단위·Storybook build/test를 실행한다. Web/Native 및 Light/Dark·390/1024/1440 실행 결과와 미실행 항목을 구분한다.

- [x] 3.1 공용 진입점과 Viewer 종료를 연결하고 남은 모달 소비처를 제거한다.
- [x] 3.2 최소 route E2E와 필요한 app 검증을 수행한다.
- [x] 3.3 Web·지원 Native의 시각·접근성·scroll/focus 결과와 미실행 항목을 기록한다.
- [x] 3.4 독립 리뷰와 canonical·OpenSpec·구현 정합성을 확인한다.

실행 결과와 Native 미실행 경계는 [verification.md](verification.md)에 기록한다. 위 체크는 Native runtime 검증 완료를 뜻하지 않는다.

## 검증 코드 범위와 완료 소유권

- 테스트 코드 범위: 기존 ReactionSummary/ReactionProfilesModal·Viewer·shell 테스트 중 변경 동작, 관련 Reaction Tests story와 새 People 화면 story, 기존 Post/navigation E2E 또는 최소 People route E2E.
- 테스트 필요성: 한 줄 측정·route 이동·query/actor 격리·오류 복구·Viewer focus의 실제 결과를 보장한다.
- 테스트 제외 범위: 새 테스트 프레임워크, 관련 없는 Quick Picker/Follow 전체 coverage, 광범위한 fixture·snapshot 재작성, 실제 서버의 미지원 Type 데이터.
- PROD-938이 위 구현·통합 검증, 최종 active spec 동기화와 archive를 소유한다. 검증되지 않은 Native 실행은 완료로 표시하지 않는다. 이 change는 현재 구현 검토 단계에서 archive하지 않는다.
