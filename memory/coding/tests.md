# Coding Style: Tests

## Tests

- 테스트는 요구사항의 의도와 사용자·호출자가 관찰하는 입력, 출력, 상태 변화, 실패 계약을 검증한다. 의도한 계약을 어기면 실패하고 계약을 지키는 구현 변경이나 리팩터링은 통과해야 하며, 현재 구현을 그대로 재현하는 assertion을 추가하지 않는다.
- 테스트 개수나 커버리지 수치를 채우기 위한 assertion을 추가하거나 같은 계약을 여러 계층에서 불필요하게 중복 검증하지 않는다. 계약을 가장 직접적으로 검증하는 최소 경계를 택하고, 계층 간 상호작용이 계약에 포함되면 통합 동작도 검증한다.
- 내부 함수의 분리·호출 횟수, DOM 계층, 렌더 순서, 가상화 목록의 마운트 항목 수, fixture 기본값 같은 구현 세부를 고정하지 않는다. 접근성, 명세된 레이아웃·시간·성능, 외부 호환성처럼 구체적인 관찰 요구가 있다면 그 범위와 이유를 분명히 하고 검증한다.
- 비동기 테스트는 중간 렌더·batching·lifecycle 타이밍이 아니라 계약상 완료 신호나 상태를 기다린다. Flake가 생기면 제품 결함과 테스트 동기화 문제를 구분해 조사하며, 고정 sleep·맹목적 retry·skip·검증 약화로 숨기지 않는다.

- 파일을 읽어 코드를 실행하거나 배포 자산·생성 산출물의 내용·치수·시각 결과·escaping 등 관찰 가능한 출력 계약을 검증하는 테스트는 유지한다. 출력 계약과 무관한 직렬화 형식이나 내부 버전 문자열은 고정하지 않는다.
- 소스·workflow·설정 파일을 읽고 `includes`, `indexOf`, 정규식, 문자열 snapshot으로 특정 구현 문구의 존재·부재·순서만 검사하는 테스트를 추가하지 않는다. 구현을 실행하지 않는 이런 검사는 동작을 증명하지 못한다.
- 테스트 줄 수를 줄이거나 `contract`, `security`, `regression`이라는 이름을 붙여 같은 검사를 유지하지 않는다. AST·파싱 결과로 옮겨 구현 구조만 그대로 검사하는 방식도 대안이 아니다.
- 고정된 UI 문구의 존재나 동일성만 확인하는 assertion은 추가하지 않는다. 실제 동작을 실행해 입력·출력·상태 변화·실패·escaping을 검증하는 과정의 문자열 비교는 허용하고, 액션 수행에 쓰는 접근 가능한 이름 기반 selector도 유지한다.
- import한 config/meta를 그대로 비교하거나 production 계산식을 복제한 expected 값은 동작 증거가 아니다.
- 외부 경계는 mock할 수 있지만 검증 대상인 소유 정책과 상태 변환은 실제 경로에서 검증한다. mock이 필요한 하위 콘텐츠나 로드·실패 효과를 생략하거나 성공 상태를 미리 제공해 필수 실행 단계를 건너뛰게 하지 않는다. test-only invalidate로 실제 경로 누락을 감추지 않는다.
- production API를 테스트 계측 callback으로 넓히지 않는다. UI/Relay action의 성공·실패는 callback 카운터가 아니라 렌더된 UI/Toast와 Relay Store, focus는 실제 ref·dismiss 경계를 관찰한다.
- 검증하려는 정책이 적용되는 fixture/actor를 사용하고, 그 정책이 잘못되면 assertion에 드러나게 구성한다. 의무적으로 mutation testing 도구를 추가하지 않는다.
- GraphQL partial response를 검증할 때는 실제 schema로 도달 가능한 `errors.path`와 `null` 전파를 재현한다. 오류 필드를 non-null로 채운 완전한 fixture로 부분 응답을 흉내 내지 않는다.
- 구조 테스트가 실패하면 기대 문자열을 먼저 맞추지 말고 유효한 행동을 보장하는지 판단한 뒤 중복을 삭제하거나 최소 행동을 검증한다.
- Workflow 문법은 actionlint 같은 표준 도구로 검사한다. 실제 환경에서만 확인할 수 있는 동작은 미검증으로 명시하며, 그 공백을 소스 문자열 검사로 채우지 않는다. 테스트를 만들기 위해 불필요한 공통 추상화나 새 의존성을 추가하지 않는다.
- 테스트는 로컬에서 실행하지 않고 CI에서 실행한다. 로컬 테스트 실행을 PR 준비 조건으로 요구하지 않는다. PR 필수 CI는 최신 PR head SHA에서 성공했는지 확인하고, CI 결과가 다루지 않는 실제 환경 동작은 미검증으로 명시한다.
- Relay 관계 action 회귀는 승인된 caller의 실제 mutation 응답이 normalized record·connection에 수렴하고 무관한 normalized record·화면 상태가 유지되는지, actor A→B 전환 뒤 늦은 A 응답에도 B UI·Store가 보존되는지를 실행으로 확인한다. action 종료 후에는 승인된 focus 계약에 맞춰 실제 trigger 또는 필요한 entry heading ref로 focus가 복원되는지를 확인하며, 모든 action 뒤 heading focus를 일괄 assertion으로 요구하지 않는다.
