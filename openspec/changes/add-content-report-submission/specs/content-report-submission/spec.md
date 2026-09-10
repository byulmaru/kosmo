## ADDED Requirements

### Requirement: 신고 제출자와 viewer

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/objects/account.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 서버는 인증된 `Account.Active`의 신고만 허용해야 한다(SHALL). Selected Profile 선택을 필수로 요구해서는 안 된다(MUST NOT). 실제 선택된 유효 Profile을 viewer로 사용하고, 미선택이면 공개 조회 범위를 적용해야 한다(SHALL). 다른 소유 Profile이나 Account 전체의 관계를 대신 사용해서는 안 된다(MUST NOT).

#### Scenario: Selected Profile 없이 공개 대상 신고

- **WHEN** 활성 Account가 Profile을 선택하지 않고 공개 조회 가능한 저장 대상을 제출한다
- **THEN** Profile 선택을 요구하지 않고 공개 조회 권한으로 대상 자격을 판정한다

#### Scenario: 인증 또는 활성 상태 실패

- **WHEN** 인증되지 않았거나 Account가 Active가 아닌 요청이 도착한다
- **THEN** 신고를 거절하고 Slack에 발송하지 않는다

#### Scenario: 선택한 viewer의 권한만 적용

- **WHEN** 선택한 유효 Profile은 대상을 볼 수 없지만 같은 Account의 다른 Profile은 볼 수 있다
- **THEN** 다른 Profile의 권한을 빌려 신고를 허용하지 않는다

### Requirement: 저장된 대상의 제출 시점 직접 조회 권한

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), [PROD-822](https://linear.app/byulmaru/issue/PROD-822). 서버는 저장된 local/remote Post·Profile을 해석하고 발송 전에 현재 viewer의 공통 직접 조회 authorization을 다시 적용해야 한다(SHALL). 메뉴 표시·client cache·검색 후보성은 제출 권한의 근거가 아니며, 신고 전용 Block predicate나 우회 경로를 만들어서는 안 된다(MUST NOT). 현재 저장 capability가 표현하는 제한 상태를 누락해서는 안 된다(MUST NOT). 아직 없는 Domain Block·Mention·DIRECT recipient capability를 이 기능에서 새로 구현할 의무는 없다.

#### Scenario: 작성 도중 대상 삭제 또는 권한 상실

- **WHEN** form을 연 뒤 대상이 삭제되거나 제출 시점의 직접 조회 권한을 잃는다
- **THEN** 서버가 Slack 발송 전에 거절하고 client는 실패와 기존 입력을 유지한다

#### Scenario: 방향별 Profile Block과 Post 신고

- **WHEN** A가 B를 차단한 상태에서 A 또는 B가 서로의 Post를 신고한다
- **THEN** 공통 직접 조회 정책에 따라 A의 B Post 접근은 다른 조회 조건을 통과하면 허용하고 B의 A Post 접근은 거절한다
- **AND** mutual Block이면 양쪽의 상대 Post 신고를 거절하며 잔존 Follow만으로 제한을 우회하지 않는다

#### Scenario: Block pair의 Profile 기본정보

- **WHEN** Block 관계가 있는 상대 Profile의 기본정보가 공통 Profile 직접 조회 정책을 통과한다
- **THEN** Post 제한이나 양방향 검색 필터를 Profile 신고 자격에 대신 적용하지 않는다

#### Scenario: FOLLOWERS와 미선택 viewer

- **WHEN** FOLLOWERS Post에 대한 신고가 도착한다
- **THEN** 현재 지원되는 공통 직접 조회 권한을 적용하며 미선택 viewer에게 다른 소유 Profile의 Follow를 부여하지 않는다
- **AND** 아직 지원하지 않는 Mention 또는 DIRECT recipient 권한을 새로 추론하지 않는다

#### Scenario: 저장되지 않은 remote 대상

- **WHEN** 저장된 Post·Profile로 해석되지 않는 URL 또는 식별자가 제출된다
- **THEN** 새 remote fetch나 등록 없이 거절하며 ActivityPub Flag를 전송하지 않는다

### Requirement: 신고 사유와 상세 설명 검증

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 신고는 유해·부적절한 콘텐츠, 괴롭힘·혐오·위협, 스팸·사기, 아동 안전 우려, 기타 중 선택한 사유와 선택적 상세 설명을 받아야 한다(SHALL). `기타`에는 공백이 아닌 설명이 필요하며 설명은 최대 2,000자여야 한다(SHALL). client와 서버는 같은 문자 수 기준으로 검증해야 한다(SHALL). 사유를 자동 위반 판정이나 CSAM 분류 결과로 취급해서는 안 된다(MUST NOT).

#### Scenario: 선택 사유와 선택적 설명

- **WHEN** `기타`가 아닌 유효한 사유와 빈 설명을 제출한다
- **THEN** 설명이 없다는 이유로 거절하지 않는다

#### Scenario: 기타 설명 누락

- **WHEN** `기타`를 선택하고 설명을 생략하거나 공백만 입력한다
- **THEN** 입력 오류를 표시하며 서버도 발송 전에 거절한다

#### Scenario: 사유와 길이 경계

- **WHEN** 사유를 선택하지 않거나 알 수 없는 사유를 제출하거나 설명이 2,000자를 초과한다
- **THEN** 서버가 발송 전에 거절하고 입력을 유지한다
- **AND** 유효한 사유와 정확히 2,000자인 설명은 길이 조건을 통과한다

### Requirement: 최소 Slack payload와 Privacy 경계

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). Slack payload는 대상 종류, 서버가 확인한 안정적 대상 ID, Kosmo 링크, remote 대상의 원본 URI, 사유와 입력한 상세 설명으로 제한해야 한다(SHALL). 신고자 Account·Profile 식별정보, 이름, IP, 세션·인증 정보를 추가해서는 안 된다(MUST NOT). 대상 원문·media를 자동 복사하거나 링크 미리보기로 확대 노출해서는 안 된다(MUST NOT). Slack credential은 client·repository·log에 노출하지 않고 신고 본문을 불필요한 log·telemetry에 남기지 않아야 한다(SHALL). 사용자가 직접 개인정보를 입력할 수 있으므로 완전한 익명 신고라고 안내해서는 안 된다(MUST NOT).

#### Scenario: 조작된 대상 메타데이터

- **WHEN** client가 신고 ID와 함께 임의 링크·표시 이름·신고자 정보를 보낸다
- **THEN** 서버가 확인한 대상 정보만으로 payload를 만들며 추가 신고자 필드는 Slack에 전달하지 않는다

#### Scenario: 민감한 설명과 credential

- **WHEN** 설명에 개인정보가 포함된 신고를 처리하거나 Slack 호출이 실패한다
- **THEN** 필요한 전송 외의 log·telemetry·오류 응답에 설명이나 credential을 복제하지 않는다
- **AND** Slack 출력에 자동 원문·media 복사나 링크 미리보기가 붙지 않는다

### Requirement: Slack 확인 결과와 불확실한 전달

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). Slack의 HTTP 200과 `ok` 정상 ACK를 확인했을 때만 성공을 반환·안내해야 한다(SHALL). 성공은 Slack 수신 확인이며 운영자 처리 완료가 아니다. 확인된 거절과 전달 여부를 확인할 수 없는 결과를 구분해야 한다(SHALL). timeout·connection reset·response loss를 미전달이나 성공으로 단정해서는 안 된다(MUST NOT).

#### Scenario: 정상 ACK 확인

- **WHEN** 서버가 Slack의 HTTP 200과 `ok`를 확인하고 client가 그 결과를 받는다
- **THEN** Slack 전달 성공을 안내하며 운영자 검토 완료로 표시하지 않는다

#### Scenario: 발송 전 실패 또는 명시적인 거절

- **WHEN** 발송 전 검증이 실패하거나 Slack의 명시적인 거절을 확인한다
- **THEN** 실패를 반환하고 성공으로 표시하지 않는다

#### Scenario: Slack 전달 여부 불확실

- **WHEN** timeout·connection reset·response loss 등으로 Slack 수신 여부를 확인하지 못한다
- **THEN** `전달 여부를 확인할 수 없음`을 반환·안내하고 입력을 유지한다

#### Scenario: API 성공 응답의 client 수신 실패

- **WHEN** Slack은 수신했을 수 있으나 client가 API 결과를 받지 못한다
- **THEN** client도 전달 여부 확인 불가로 처리하며 재전송이나 성공으로 추론하지 않는다

### Requirement: 수동 재시도와 최소 중복 제출 억제

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). Web·Android·iOS는 제출 중 입력·제출의 중복 조작을 억제해야 한다(SHALL). 불확실 결과를 자동 재전송해서는 안 되며(MUST NOT), 입력을 유지하고 중복 전달 가능성을 알린 뒤 수동 재시도를 허용해야 한다(SHALL). 수동 재시도는 인증·대상·입력을 다시 확인하는 새 발송 시도다. 요청 처리 중 서버 동시 억제를 사용한다면 실제 범위를 넘어서 전역·시간 구간·장기 중복 방지를 보장해서는 안 된다(MUST NOT). 이 기능에서 Account별 `N회 / 시간 구간` 한도를 정의하거나 적용하지 않는다.

#### Scenario: 빠른 중복 클릭 또는 탭

- **WHEN** 사용자가 제출 중 제출 버튼을 반복 조작한다
- **THEN** 같은 form이 추가 제출 요청을 시작하지 않는다

#### Scenario: 불확실 결과의 수동 재시도

- **WHEN** 중복 가능성 안내를 받은 사용자가 직접 재시도한다
- **THEN** 입력을 사용해 새 발송 시도를 시작하며 현재 인증·대상 권한·입력을 다시 검증한다
- **AND** PROD-915의 Account별 시간 구간 한도를 적용하지 않는다

#### Scenario: 선택적으로 사용하는 process-local 동시 억제

- **WHEN** 서버가 process-local 요청 중복 억제를 사용한다
- **THEN** 같은 process의 해당 동시 요청 범위만 억제하며 다른 replica·재시작 이후·장기 중복까지 막았다고 안내하지 않는다

### Requirement: 신고 form의 presentation과 draft lifecycle

**Authority / Provenance:** `docs/design/content-reporting.md`, `docs/design/feedback.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). Web은 반응형 dialog/sheet, Android/iOS는 현재 대상 화면 위 modal/sheet로 신고 form을 제공해야 한다(SHALL). dirty 상태의 명시적 닫기는 폐기 확인을 거치며 취소하면 입력을 유지해야 한다(SHALL). 제출 중 명시적 닫기를 막고 지원하는 dismissal 경로에도 같은 경계를 적용해야 한다(SHALL). 실패·확인 불가에서는 입력을 유지하고 성공하면 입력을 초기화하되 성공 결과를 화면에 남겨야 한다(SHALL). 폐기 후 재열기는 새 draft이며 durable 복원은 제공하지 않는다.

#### Scenario: draft 폐기 취소와 재열기

- **WHEN** dirty form을 닫으려다가 폐기 확인을 취소한다
- **THEN** 같은 입력으로 계속 작성한다
- **AND** 이후 폐기를 확정하고 다시 열면 이전 입력 없이 새 form을 연다

#### Scenario: 제출 중 dismissal

- **WHEN** 제출 중 닫기 버튼·배경·지원되는 back 또는 dismissal gesture를 조작한다
- **THEN** form을 명시적으로 닫거나 추가 제출을 시작하지 않는다

#### Scenario: 성공과 실패의 입력 처리

- **WHEN** 정상 ACK 결과를 받는다
- **THEN** 입력을 초기화하고 열린 form에 성공 결과를 남긴다
- **AND** 실패 또는 확인 불가 결과에는 입력을 지우지 않는다

### Requirement: 플랫폼별 접근성과 실행 검증

**Authority / Provenance:** `docs/design/content-reporting.md`, `docs/design/accessibility.md`, `docs/design/post-action-bar.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 신고 진입점·대상·사유·제출 상태와 결과는 보조 기술로 구분할 수 있어야 한다(SHALL). Web keyboard·focus trap·닫기 후 유효한 trigger 또는 fallback으로의 복귀를 제공해야 한다(SHALL). Android와 iOS의 keyboard·dismissal·touch·font scaling·TalkBack/VoiceOver를 각각 실제 runtime에서 검증해야 한다(SHALL). Web 실행 증거로 Native 검증을 대체해서는 안 된다(MUST NOT).

#### Scenario: Web keyboard로 열고 닫기

- **WHEN** keyboard로 메뉴에서 신고를 열고 작성한 뒤 허용된 닫기를 수행한다
- **THEN** 열린 동안 focus가 modal 안에 유지되고 닫은 뒤 유효한 trigger 또는 fallback으로 돌아간다

#### Scenario: Native 접근성 검증

- **WHEN** Android와 iOS에서 각각 신고 form을 사용한다
- **THEN** keyboard·스크롤·지원 dismissal·보조 기술·font scaling과 공용 Button의 플랫폼별 최소 크기를 실제 실행 결과로 확인한다

### Requirement: 저장 없는 전달의 보장 한계

**Authority / Provenance:** `docs/domain/decisions/0030-content-report-submission.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 이 기능은 신고 DB·durable delivery 상태·신고 처리 상태를 만들지 않는다. exactly-once, crash 이후 복구, 최종 전달이나 운영자 처리, 장기 draft 보존을 보장해서는 안 된다(MUST NOT). 신고 자체가 대상 노출·관계·상태를 자동으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 프로세스 종료 또는 화면 환경 종료

- **WHEN** 전송 중 서버 process나 client 앱·탭이 종료된다
- **THEN** durable 복구나 중복 없는 최종 전달을 약속하지 않으며 화면 닫기를 이미 시작한 발송의 취소로 안내하지 않는다

#### Scenario: 신고 후 대상 상태

- **WHEN** Slack이 신고를 정상 수신한다
- **THEN** 신고를 이유로 대상의 노출·검색 후보·관계·moderation 상태를 자동 변경하지 않는다
