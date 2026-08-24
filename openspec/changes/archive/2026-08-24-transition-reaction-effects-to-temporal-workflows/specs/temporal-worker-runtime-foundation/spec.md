## ADDED Requirements

### Requirement: Reaction Effects Worker 등록과 lifecycle

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-723` — Worker의 단일 production entrypoint는 Reaction Create Effects Workflow, Reaction Delete Effects Workflow와 필요한 Notification·ActivityPub Activities를 기존 task queue에 compile-time 등록해야 한다(MUST). 이 등록은 runtime enable flag나 테스트 전용 export에 의존해서는 안 된다(MUST NOT).

#### Scenario: Worker 시작

- **WHEN** Worker process가 유효한 Temporal과 database 환경으로 시작한다
- **THEN** 기존 하나의 Worker instance가 Reaction create/delete Workflow와 Activities를 함께 poll한다

#### Scenario: Activity retry

- **WHEN** accepted Reaction Workflow의 Activity가 재시도 가능한 오류를 반환한다
- **THEN** Worker는 기존 bounded Activity retry 정책으로 같은 입력을 다시 실행한다

#### Scenario: Worker 재시작

- **WHEN** Reaction Workflow 실행 중 Worker process가 종료되고 다시 시작한다
- **THEN** Temporal은 완료되지 않은 Activity를 재개할 수 있다
- **AND** Workflow는 application process-local callback에 의존하지 않는다

#### Scenario: 정상 종료

- **WHEN** Worker가 종료 신호를 받는다
- **THEN** 기존 drain과 connection close 순서가 Reaction Workflow 등록에도 동일하게 적용된다
