# Coding Style: Tests

## Tests

- 소스·workflow·설정 파일을 읽고 `includes`, `indexOf`, 정규식, 문자열 snapshot으로 특정 구현 문구의 존재·부재·순서만 검사하는 테스트를 추가하지 않는다. 구현을 실행하지 않는 이런 검사는 동작을 증명하지 못한다.
- 테스트 줄 수를 줄이거나 `contract`, `security`, `regression`이라는 이름을 붙여 같은 검사를 유지하지 않는다. AST·파싱 결과로 옮겨 구현 구조만 그대로 검사하는 방식도 대안이 아니다.
- 테스트는 실제 코드를 실행해 입력에 따른 출력, 상태 변화와 실패 경로를 검증한다. 함수 반환 문자열, 사용자에게 표시되는 문구, HTTP 응답처럼 관찰 가능한 결과의 문자열 비교는 허용한다. 금지 대상은 문자열 비교 연산 자체가 아니라 소스 문구를 동작의 대용으로 검사하는 테스트다.
- import한 config/meta를 그대로 비교하거나 production 계산식을 복제한 expected 값은 동작 증거가 아니다.
- 외부 경계는 mock할 수 있지만 검증 대상인 소유 정책이나 상태 변환을 mock하거나 test-only invalidate로 실제 경로 누락을 감추지 않는다.
- production API를 테스트 계측 callback으로 넓히지 않는다. 성공·실패는 callback 카운터가 아니라 렌더된 UI/Toast와 Relay Store, focus는 실제 ref·dismiss 경계를 관찰한다.
- 검증하려는 정책이 적용되는 fixture/actor를 사용하고, 그 정책이 잘못되면 assertion에 드러나게 구성한다. 의무적으로 mutation testing 도구를 추가하지 않는다.
- schema로 도달 가능한 partial response에서는 `errors.path`와 nullable `null` 전파를 검증한다. 오류 필드를 non-null로 채운 완전한 fixture로 부분 응답을 흉내 내지 않는다.
- 구조 테스트가 실패하면 기대 문자열을 먼저 맞추지 말고 유효한 행동을 보장하는지 판단한 뒤 중복을 삭제하거나 최소 행동을 검증한다.
- Workflow 문법은 actionlint 같은 표준 도구로 검사한다. 실제 환경에서만 확인할 수 있는 동작은 미검증으로 명시하며, 그 공백을 소스 문자열 검사로 채우지 않는다. 테스트를 만들기 위해 불필요한 공통 추상화나 새 의존성을 추가하지 않는다.
- Relay 관계 action 회귀는 승인된 caller의 실제 mutation 응답이 normalized record·connection에 수렴하고 무관한 normalized record·화면 상태가 유지되는지, actor A→B 전환 뒤 늦은 A 응답에도 B UI·Store가 보존되는지를 실행으로 확인한다. action 종료 후에는 승인된 focus 계약에 맞춰 실제 trigger 또는 필요한 entry heading ref로 focus가 복원되는지를 확인하며, 모든 action 뒤 heading focus를 일괄 assertion으로 요구하지 않는다.
