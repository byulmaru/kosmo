## Context

이 기록은 PROD-469의 최신 설명과 사용자 확인을 바탕으로 proposal의 Web 분석 범위, capability specs의 행동 계약, design의 구현 지침을 구속력 있는 선택과 비구속 구현 안내로 분리한다.

## Decision Records

### Web 전용 OpenPanel 도입과 후속 범위 분리

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`, `PROD-537`, `PROD-539`
- Status: Active
- Context / Problem: 첫 분석 도입에 Web과 native, 현재 핵심 행동과 추가 소셜 행동을 모두 포함하면 독립 배포 가능한 범위가 섞인다.
- Decision Outcome: PROD-469는 Web만 구현한다. Android·iOS는 PROD-537, 재게시·반응·북마크는 PROD-539로 분리한다.
- Alternatives Considered: 모든 플랫폼과 이벤트를 한 번에 구현하는 방법은 배포·검증 경계가 커져 제외했다.
- Consequences: 이번 변경의 공통 import는 native에서 no-op이어야 하며, 후속 이슈가 현재 변경의 완료를 막지 않는다.
- Confirmation / Follow-up: native bundle에 OpenPanel client가 생성되지 않는지 확인한다.

### Client ID 존재 여부를 유일한 활성화 조건으로 사용

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`
- Status: Active
- Context / Problem: 별도 environment 또는 enabled flag는 실제 배포 조건과 어긋나는 이중 상태를 만든다.
- Decision Outcome: `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`가 있을 때만 `https://openpanel.byulmaru.co/api`를 사용하는 Web client를 생성한다.
- Alternatives Considered: production environment 검사나 별도 boolean flag는 사용하지 않는다.
- Consequences: local에서도 Client ID를 명시하면 분석이 활성화되고, production CI는 해당 값 주입 책임을 가진다.
- Confirmation / Follow-up: Client ID 유무에 따른 초기화 test와 production build 설정을 확인한다.

### 자동 수집과 10% session replay 설정

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`
- Status: Active
- Context / Problem: 제품 사용 흐름을 충분히 관찰하되 replay 노출과 저장량을 제한해야 한다.
- Decision Outcome: `trackScreenViews`, `trackOutgoingLinks`, `trackAttributes`를 활성화하고 replay sample rate를 10%로 설정한다. 모든 입력과 Post Content를 마스킹한다.
- Alternatives Considered: 자동 수집 비활성화, replay 미사용, 전체 replay는 승인된 관찰 범위 또는 최소화 수준과 맞지 않아 제외했다.
- Consequences: URL query, title, referrer와 외부 링크 정보가 자동 수집될 수 있어 처리방침에 구체적으로 고지해야 한다.
- Confirmation / Follow-up: replay에서 input과 canonical Post Content를 실제로 확인한다.

### Account identity와 제한된 event 속성

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`
- Status: Active
- Context / Problem: 사용자 여정을 연결하려면 identity가 필요하지만 직접 식별자와 자유 형식 콘텐츠 전송은 피해야 한다.
- Decision Outcome: opaque Account ID만 identity로 사용한다. 선택 Profile ID는 필요한 명시적 이벤트 속성으로만 보내며 이름·handle·검색어·Post 본문·오류 원문은 보내지 않는다. 성공한 로그아웃 뒤 identity를 clear한다.
- Alternatives Considered: Profile ID를 identity로 사용하거나 이메일·이름을 trait로 보내는 방법은 계정 생명주기와 최소수집 원칙에 맞지 않아 제외했다.
- Consequences: 허용된 event taxonomy와 속성은 성공 경계의 호출부와 payload test로 유지한다. 로그인 성공 이벤트는 취소·실패와 탭 경합을 정확히 구분하기 위한 별도 상태를 만들지 않고 수집 범위에서 제외한다.
- Confirmation / Follow-up: SDK 호출 test에서 identity와 event payload를 검사한다.

### 분석 장애를 제품 흐름에서 격리

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-469`
- Status: Active
- Context / Problem: 외부 분석 endpoint, browser 차단기 또는 SDK 오류가 인증·navigation·mutation 결과를 바꾸면 제품 가용성이 저하된다.
- Decision Outcome: 분석 client 경계가 초기화·identity·event 오류를 흡수하며 모든 호출을 best-effort로 처리한다.
- Alternatives Considered: 각 호출자가 오류를 처리하거나 사용자 오류 UI에 합치는 방식은 일관성이 낮고 분석 장애를 제품 장애로 노출해 제외했다.
- Consequences: 분석 데이터는 일부 누락될 수 있으나 제품 성공이 우선한다. 분석 오류는 telemetry에 재전송하지 않는다.
- Confirmation / Follow-up: SDK가 throw 또는 reject하는 test에서 원래 callback이 완료되는지 확인한다.

### 공개 처리방침과 수동 삭제 절차

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`, `PROD-538`, `PROD-540`; 개인정보보호위원회 「개인정보 처리방침 작성지침」 2026.4 개정
- Status: Active
- Context / Problem: 실제 자동 수집과 replay를 투명하게 고지하고 정보주체의 열람·삭제·처리정지 요청을 수행할 절차가 필요하다.
- Decision Outcome: 인증 없는 `/privacy`에 실제 분석 처리 항목과 권리 행사 방법을 공개한다. v1 Account별 삭제는 대상 확인과 사후 검증을 포함한 관리자 runbook으로 수행한다.
- Alternatives Considered: 외부 사이트에만 고지하는 방법은 Kosmo 사용자 접근성이 낮고, 즉시 자동 삭제 API를 만드는 방법은 PROD-469 범위를 확장해 제외했다.
- Consequences: opt-out UI와 자동 삭제는 각각 PROD-540, PROD-538에서 구현한다. 그 전까지 권리 요청은 고지된 연락처로 접수한다.
- Confirmation / Follow-up: 비로그인 route, landing/menu link, 처리방침 내용과 runbook을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
