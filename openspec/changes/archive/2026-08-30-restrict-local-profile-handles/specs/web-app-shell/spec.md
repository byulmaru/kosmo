## ADDED Requirements

### Requirement: Local Profile handle policy feedback

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/design/accessibility.md`, `PROD-816` — 이 요구사항을 MUST 준수한다.
Android, iOS와 Web의 Local Profile 생성 UI는 서버와 같은 System Reserved Handle 계약으로 handle을 사전
검증해야 한다(MUST). 사전 검증에서 거부한 handle은 생성 mutation을 호출해서는 안 되며(MUST NOT), 기존
handle TextField의 오류 상태와 연결된 안전한 문구를 제공해야 한다(MUST). 서버가 정책 위반을 반환한 경우에도
같은 field 오류를 사용하고 입력값을 유지해야 한다(MUST).

#### Scenario: Stop a reserved handle before mutation

- **WHEN** 사용자가 System Reserved Handle과 대소문자만 다르게 일치하는 handle로 Profile 생성을 제출한다
- **THEN** 클라이언트는 생성 mutation을 호출하지 않는다
- **AND** handle 입력 아래에 `사용할 수 없는 단어가 포함된 핸들이에요.`를 표시한다

#### Scenario: Allow a handle outside the current creation policy

- **WHEN** 사용자가 `porn`, `p_o_r_n` 또는 `p0rn`처럼 과거 유해표현 정책이 거부했지만 System Reserved Handle과 정확히 일치하지 않는 유효한 handle로 Profile 생성을 제출한다
- **THEN** 클라이언트는 그 값이 과거 유해표현 정책의 대상이었다는 이유만으로 생성을 중단하지 않는다
- **AND** 기존 클라이언트 형식 검증을 통과하면 생성 mutation을 호출한다

#### Scenario: Submit a non-matching substring handle

- **WHEN** 사용자가 `supporter`, `cybersecurity`, `administrator_dev`, `class` 또는 `analysis`처럼 일부 문자열만 일치하는 유효한 handle을 제출한다
- **THEN** 클라이언트는 System Reserved Handle 정책만을 이유로 생성을 중단하지 않는다
- **AND** 다른 클라이언트 검증을 통과하면 생성 mutation을 호출한다

#### Scenario: Present a newer server rejection safely

- **WHEN** 클라이언트 사전 검증을 통과한 handle을 서버의 System Reserved Handle 정책이 거부한다
- **THEN** 클라이언트는 입력값과 생성 form을 유지한다
- **AND** handle 입력 아래에 `사용할 수 없는 단어가 포함된 핸들이에요.`를 표시한다
- **AND** raw GraphQL·validation 오류, 내부 목록과 일치한 표현을 표시하지 않는다

#### Scenario: Reuse the accessible TextField error state

- **WHEN** System Reserved Handle 정책으로 handle 오류를 표시한다
- **THEN** 기존 TextField의 오류 border와 helper/error 문구를 사용한다
- **AND** input과 오류 설명의 programmatic 연결을 유지한다
- **AND** 오류를 색만으로 전달하거나 같은 내용을 중복 announcement하지 않는다
- **AND** 정책 오류만을 위한 별도 시각 variant를 렌더링하지 않는다

#### Scenario: Preserve unrelated creation failures

- **WHEN** Local Profile 생성이 System Reserved Handle 정책 이외의 이유로 실패한다
- **THEN** 클라이언트는 기존 안전한 오류 표시와 재시도 계약을 유지한다
- **AND** 정책 위반 문구로 모든 실패를 덮어쓰지 않는다
