## Why

Native 앱 초기 로딩 중 화면을 잠갔다가 돌아오면 일시적인 연결 끊김 뒤 앱 전체나 홈 오류 화면에 머무를 수 있다.
PROD-1138의 초기 조회 복구와 기존 세션·프로필 격리를 함께 검증하기 위해 작업 순서를 정리한다.

## Goal

iOS와 Android에서 잠금·복귀로 중단된 초기 조회를 자동으로 한 번 재시도해 앱을 정상적으로 이용할 수 있게 한다.
계속 실패하면 기존 오류 안내와 수동 재시도를 제공한다.

## What Changes

- 초기 로딩 단계별 잠금·복귀와 요청 실패 시점을 기록하고, 확인된 실패 경계에서 복구한다.
- 자동 재시도가 세션·프로필 선택과 무관한 화면 상태를 보존하는지 검증한다.
- iOS의 재현·복구와 Android의 재현 여부·복구 결과를 별도로 남긴다.

## Non-Goals

- 이 Spec 세션에서 앱 구현, 동작 테스트, 배포 또는 PR 생성.
- Web 복구 정책, 정상 로딩 후의 일반 갱신, mutation 자동 재실행, 기기 재부팅·프로세스 종료 복원.
- PROD-1051의 홈 탭 재진입 문제, PROD-1140의 작성기 복귀 문제, PROD-997의 서버 HTTP 504 조사.
- 새 오프라인 화면, 오류 문구 개편, 전체 Relay·내비게이션 구조 변경.

## Constraints

- 자동 재시도는 잠금·복귀와 관련해 중단된 초기 조회에 한 번만 적용한다. 지속 자동 재시도는 하지 않는다.
- transport 실패를 인증 만료로 해석해 credential이나 저장된 프로필 선택을 지우지 않는다.
- query-local 복구는 무관한 actor Store·내비게이션을 초기화하지 않는다. 루트로 전파된 오류의 수동 복구는
  기존 provider runtime 재생성 계약을 유지한다.
- 실제 실패 operation과 Native 연결 중단 원인은 아직 확정되지 않았다. 코드 조사와 Native 재현을 구분한다.

## Verification

- token 복원 중, `SessionProviderQuery`, `UniversalShellQuery`, `HomePageQuery` pending에서 각각 잠금·복귀한다.
- 정상 연결, 지속 오프라인, 연속 잠금·복귀, 수동 재시도, 늦은 응답·actor 전환을 실행 동작으로 검증한다.
- 플랫폼별 빌드·OS·AppState·operation·잠금 시간·반복 횟수·요청 결과를 기록한다.
- Spec 완료 시 문서·계약 대조와 strict validation만 기록한다. 앱 동작·CI·Native 검증은 다음 세션에 남긴다.

## Business Context

- Product canonical: `docs/domain/objects/session.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0032-native-startup-recovery.md`.
- Visual design source: `docs/design/README.md`. 새 시각 결정은 없으며 기존 loading/error와 수동 재시도를 유지한다.
- Linear: [PROD-1138](https://linear.app/byulmaru/issue/PROD-1138).
- User agreement: 2026-10-22 명시적 Spec 요청과 “복귀 시 자동 재시도 1회 후, 계속 실패하면 기존 오류 안내와 수동 재시도 제공” 선택.

## Session Status

- Status: Active
- Last updated: 2026-10-22
