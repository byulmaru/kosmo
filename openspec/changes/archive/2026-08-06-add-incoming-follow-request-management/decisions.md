## Context

이 기록은 Follow Request의 pending-only domain·GraphQL 계약, 공통 PageHeader·접근성·breakpoint canonical 문서와 최신 PROD-566·PROD-654 범위를 구현 전에 대조한 결과를 담는다. 구현 세부 helper나 Relay updater 형태는 durable choice로 고정하지 않고 `design.md`의 비규범적 guidance에 남긴다.

## Decision Records

### 받은 요청은 전용 canonical route에서 관리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-566`
- Status: Active
- Context / Problem: 공개 established follower 목록이나 notification 화면에 private pending request 관리를 섞지 않고, full/compact/mobile shell이 공유할 안정된 destination이 필요하다.
- Decision Outcome: protected `/follow-requests` route를 canonical destination으로 사용하고 공통 `PageHeader`에 `팔로워 요청` heading을 표시한다.
- Alternatives Considered: 기존 `/followers` 하위 모드, notification 하위 route, route 없는 modal. 공개 관계와 pending 권한이 섞이거나 별도 이슈 생명주기에 종속되고 canonical navigation이 불명확해 제외했다.
- Consequences: 화면 상태는 같은 PageHeader 아래에서 전환하고 shell 진입점은 route가 준비된 뒤에만 노출한다.
- Confirmation / Follow-up: direct route, 공통 heading과 세 shell surface destination을 통합 검증한다.

### 요청 행은 requester와 승인·거절을 직접 표현한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566`
- Status: Active
- Context / Problem: 사용자가 요청자를 식별하고 최소 단계로 pending request를 처리해야 하며, nullable requester를 숨기면 active participant가 request를 정리할 수 없다.
- Decision Outcome: 일반 행은 아바타, 표시 이름, `@relativeHandle`, Profile link와 분리된 `승인`·`거절`을 제공한다. 요청 시각은 표시하지 않는다. requester가 unavailable이면 `확인할 수 없는 프로필` fallback과 `거절`만 제공한다.
- Alternatives Considered: 거절을 overflow에 숨기기, 상세 modal에서 처리하기, unavailable edge filter. 작업을 불필요하게 숨기거나 단계가 늘고 pending row 정리 권한을 잃어 제외했다.
- Consequences: Profile link와 action target을 접근성 트리에서 구분하고 unavailable row에는 Profile link와 승인 control을 만들지 않는다.
- Confirmation / Follow-up: 일반·unavailable fixture, keyboard runtime과 browser accessibility-tree 의미를 검증한다.

### 처리 결과는 서버 성공 뒤 connection에 반영한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566`
- Status: Active
- Context / Problem: approve/reject payload는 삭제된 request ID를 반환하지만 삭제 Node나 edge를 반환하지 않으며, 낙관적 제거는 실패 시 사용자가 결과를 오인하게 할 수 있다.
- Decision Outcome: mutation 중에는 해당 행의 두 action만 비활성화한다. 서버 성공 뒤 삭제 ID로 현재 actor connection의 정확한 행을 제거하고, 실패 시 행·오류·같은 action 재시도를 유지한다.
- Alternatives Considered: mutation 시작과 동시에 행 제거, 전체 목록 refetch, 전역 toast만 사용. 잘못된 성공 표시, 불필요한 네트워크·상태 손실 또는 복구 위치 불명확 때문에 제외했다.
- Consequences: 다른 행은 병렬로 처리할 수 있고 approve 성공 관계는 Relay normalization으로 반영한다. cache updater의 내부 형태는 specs를 만족하는 declarative 또는 explicit 방식 모두 허용한다.
- Confirmation / Follow-up: approve/reject 성공, 실패·재시도와 정확한 edge 제거를 Relay/component test로 검증한다.

### pagination과 actor 상태를 목록 경계에서 격리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566`
- Status: Active
- Context / Problem: selected Profile 전환과 다음 페이지 실패가 이전 actor의 목록·pending·error를 새 화면에 섞거나 이미 표시된 요청을 잃게 만들 수 있다.
- Decision Outcome: 목록 끝에서 다음 cursor page를 자동으로 요청하고 실패 시 기존 목록과 하단 retry를 유지한다. selected Profile 전환 시 이전 Profile의 목록·pending·error·cache와 늦은 응답이 새 Profile 화면이나 connection에 영향을 주지 않게 한다.
- Alternatives Considered: 명시적 `더 보기` button, 전환 중 이전 Profile 상태를 새 Profile 화면에 유지하기, 시간순·page size를 공개 계약으로 고정. 승인된 UX와 actor 격리 결과에 맞지 않거나 불필요한 공개 계약을 만들기 때문에 제외했다.
- Consequences: 정확한 page size, 내부 pagination trigger threshold와 actor 격리 구현 수단은 구현 선택으로 남지만 opaque cursor·deterministic order는 유지한다.
- Confirmation / Follow-up: 다음 페이지 성공·실패와 늦은 이전 actor 응답 격리를 검증한다.

### 화면과 navigation을 두 구현 이슈로 전달한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-566`, `PROD-654`, `PROD-668`
- Status: Active
- Context / Problem: 화면·Relay 구현과 세 shell surface 복원은 별도로 리뷰 가능한 변경이지만 route 없이 진입점만 배포할 수는 없고 하나의 통합 결과가 필요하다.
- Decision Outcome: PROD-566이 route·화면·Relay 처리를, PROD-654가 full Web sidebar·compact Web rail·mobile Web drawer 진입점과 shell 검증을 전달했다. PROD-668이 두 slice의 최종 Web 통합·정합성·archive 책임을 이어받는다.
- Alternatives Considered: 한 이슈·PR에 모두 포함, 별도 OpenSpec 두 개, bottom tab까지 navigation 확장. 리뷰 단위가 크거나 하나의 완료 계약이 분리되고 승인 범위를 넘기 때문에 제외했다.
- Consequences: PROD-654는 `UserRoundPlus`와 `/follow-requests`만 복원하며 mobile bottom tab과 `/menu`를 수정하지 않는다. change는 두 slice와 통합 검증이 끝나기 전 archive하지 않는다.
- Confirmation / Follow-up: 각 이슈의 담당 tests와 결합된 responsive navigation 흐름을 확인한 뒤 PROD-668 담당자가 archive한다.

### PROD-654 navigation slice를 Web surface로 한정한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-654`
- Status: Active
- Context / Problem: PROD-654는 준비된 route에 정적 navigation item을 연결하는 좁은 slice이며, 공통 component가 Native에서도 사용된다는 사실만으로 Android/iOS UI·runtime QA와 개별 glyph DOM 검증까지 완료 조건에 포함하면 승인된 Web 전달 범위를 넘는다.
- Decision Outcome: PROD-654는 full Web sidebar, compact Web rail과 mobile Web drawer만 소유한다. Android/iOS UI·runtime QA와 Native touch target은 제외하고, 기존 shared navigation의 role·accessible name·current state·focus·keyboard·drawer lifecycle 계약을 재사용한다. 제품 구현은 Lucide `UserRoundPlus`를 유지하지만 자동화는 Lucide 내부 SVG path를 고정하지 않는다.
- Alternatives Considered: Android/iOS target 수정까지 같은 PR에 포함, 항목별 수동 Web keyboard·screen reader QA 추가, Lucide SVG path를 1:1 assertion으로 유지. 첫 번째는 승인 범위와 Native QA 책임을 확장하고, 나머지는 새 semantics가 없는 정적 shared item에 중복 검증 또는 라이브러리 내부 구현 결합을 만들기 때문에 제외했다.
- Consequences: PROD-654 자동화는 label·destination·current state·순서·drawer close와 bottom tab·`/menu` 비노출을 검증한다. 기존 Native shell은 변경하지 않으며 PROD-668이 화면·Relay slice와 navigation slice의 최종 통합·archive를 이어받는다.
- Confirmation / Follow-up: Shell Storybook addon-a11y와 Web E2E 통과, production navigation mapping의 `UserRoundPlus` 사용과 Android/iOS diff 부재를 확인한다.

### PROD-668 완료는 Web 통합 증거로 한정하고 실제 screen-reader·Native QA는 후속으로 분리한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-668`, `PROD-699`
- Status: Active
- Context / Problem: 실제 Web VoiceOver/NVDA와 Native QA를 당분간 운영하지 않는 동안 해당 runtime 증거를 기존 task와 archive gate에 유지하면 Web으로 전달된 두 구현 slice와 OpenSpec을 완료할 수 없다.
- Decision Outcome: PROD-668은 Relay/component 자동화, 세 Web navigation surface와 selected Profile 승인·거절을 연결한 cross-slice E2E, Web keyboard runtime과 browser accessibility-tree의 role/name/state 의미를 현재 완료 증거로 사용한다. 실제 Web VoiceOver/NVDA announcement와 Android/iOS runtime QA는 PROD-699의 향후 QA 계획에만 기록하며 이 change를 차단하지 않는다.
- Alternatives Considered: 실제 Web screen-reader와 Android/iOS runtime evidence를 계속 archive gate로 유지하는 방식, 실행하지 않은 runtime QA를 검증 완료로 간주하는 방식. 전자는 승인된 운영 범위와 맞지 않고 후자는 없는 platform evidence를 일반화하므로 제외했다.
- Consequences: current change와 active specs는 Web 완료 증거를 정확히 기록하고 실제 screen-reader·Native 지원 여부를 영구적으로 금지하지 않는다. PROD-699 완료는 archive된 change를 다시 열거나 task 2.4를 갱신하도록 요구하지 않는다.
- Confirmation / Follow-up: PROD-668에서 Web keyboard·accessibility-tree와 archive evidence를 기록하고, 실제 screen-reader·Native QA가 재개되면 PROD-699 자체 task와 당시 적용되는 QA 계획에서 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
