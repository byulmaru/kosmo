## Context

이 기록은 PROD-903의 완료된 Domain Gate와 2026-09-16 승인된 PROD-926 Issue Gate를 구현 계약으로 구체화한다. `Active`는 이 초안 안에서 적용할 선택이라는 뜻이며 Spec Gate 승인이나 구현 착수 승인을 대신하지 않는다. 각 항목의 상위 권위는 canonical·Linear이며 OpenSpec 자체를 제품 결정의 근거로 사용하지 않는다.

## Decision Records

### D1. 서버 delivery와 장기 제품 정책의 경계

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 Quote Notification, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-903, PROD-926의 2026-09-16 범위·Issue Gate 승인, PROD-953의 별도 소유권.
- Status: Active
- Context / Problem: 장기 Mute 정책과 UI 결과가 서버의 현재 완료 조건에 섞이면 이슈의 독립 완료 경계가 사라진다.
- Decision Outcome: PROD-926은 생성·조회·읽음·중복·정리·서버 통합과 자신의 OpenSpec sync·archive를 소유한다. 세 Mute 기반·Quote 연결은 현재 범위에서 제외하고 장기 정책은 유지한다. UI·상세 이동·클라이언트 통합은 PROD-953의 별도 change다.
- Alternatives Considered: 세 Mute를 선행 blocker로 두거나 서버에 기반 구현을 추가하는 안, UI 완료까지 기다리는 안은 사용자가 제외했다. 다시 선택하지 않는다.
- Consequences: Profile Mute·Block은 포함하며 세 Mute와 UI 미완료를 서버 change의 미완료 task로 편입하지 않는다. 새 후속 이슈를 임의 생성하지 않는다.
- Confirmation / Follow-up: 모든 requirement·task의 포함 범위와 archive 조건을 대조한다.

### D2. 영구 판단과 알림 저장의 원자성

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`의 Quote 최초 판단·재생성 금지, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-926의 첫 번째·세 번째 기술적 질문 및 PROD-327의 fail-closed 생성 경계.
- Status: Active
- Context / Problem: Notification per-kind unique나 Workflow 실행 이력은 물리 cleanup 후 첫 판단을 증명하지 못한다.
- Decision Outcome: Quote 자체의 Post ID·Recipient ID로 최종 판단 및 대표 선택을 식별하고 Notification 물리 수명과 독립적으로 보존한다. direct Source ID를 판단 key로 사용하지 않는다. 선택·insert·판단 확정은 하나의 DB transaction으로 commit한다. 승인 대기는 미확정이다. 정책 경계의 deny/fail-closed 결과가 정상 저장되면 억제로 확정하고, DB transaction 실패는 미확정으로 재시도한다.
- Alternatives Considered: Notification row만 조회하는 안은 삭제 후 재생성한다. Workflow ID만 쓰는 안은 DB 결과와 원자화되지 않는다. 표의 개수나 구체 lock 수단은 동일 불변식을 만족하면 달라도 된다.
- Consequences: Notification cleanup과 삭제 FK가 판단 기록을 제거하지 않는다. 같은 Quote identity의 재처리·재승인이 새 판단 key를 만들지 않는다. 임의 TTL·판단 reset은 이번 범위에 없다.
- Confirmation / Follow-up: 동시 transaction, commit 응답 유실, 정책 억제, DB 실패, 물리 삭제 후 replay를 실제 DB에서 검증한다.

### D3. 모든 Quote 관련 writer가 공유하는 대표 선택

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`의 Reply/Mention 분류·Quote 동시 후보, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-926과 PROD-911의 교차 Type 검증 책임.
- Status: Active
- Context / Problem: Type별 독립 insert와 first-writer-wins만으로는 동시 Reply → Quote → Mention을 보장할 수 없다.
- Decision Outcome: Quote가 원인인 동일 Post·Recipient의 모든 Reply/Quote/Mention writer는 공통 직렬화 경계에 진입한 뒤의 일관된 DB snapshot에서 commit된 후보 집합의 조건을 평가한다. 기존 대표가 있으면 우선 보존하고, 없으면 남은 후보에 Reply → Quote → Mention을 적용한다. snapshot 뒤의 승인보다 먼저 commit된 Reply/Mention은 늦은 승인으로 교체하지 않는다. 기존 알림이 여러 개 남은 비정상 입력에서는 새 Quote를 억제하고 기존 행·읽음 상태를 모두 보존하며 불일치를 관측한다.
- Alternatives Considered: Quote writer만 기존 행을 검사하는 안은 다른 Type과 경합한다. 알림을 나중에 지우거나 Type을 승격하는 안은 선생성 Read State 보존을 위반한다.
- Consequences: per-kind unique는 보조 제약으로 남는다. Source FK 연결 전의 승인 대기 인용 관계도 조정 대상으로 식별하며, 대표 record는 Notification 삭제 뒤에도 유지한다. 비Quote Post·다른 Recipient·Followee Post까지 단일 묶음으로 만들지 않는다.
- Confirmation / Follow-up: 실제 inbound Mention 결과를 포함한 concurrent·late approval·read·cleanup 조합을 검증한다. fixture만으로 최종 완료하지 않는다.

### D4. 재배포로 움직이지 않는 비소급 도입 기준

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`의 도입 전 Quote 비소급·적용 대상 Remote 최초 승인, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-926의 두 번째 기술적 질문.
- Status: Active
- Context / Problem: Worker 처리 시각이나 원격 published 시각은 재시도·재승인·외부 입력으로 달라져 과거 Quote를 새 대상으로 오인할 수 있다.
- Decision Outcome: 환경별 최초 활성화 기준 T0를 서버 DB에 한 번 고정한다. 서버의 immutable Post 생성/materialization 시각이 T0 전인 Quote는 제외하고, T0 이후 적용 대상 Quote는 최초 유효 승인 때 판단한다. 경계 전 writer·진행 중 transaction을 drain해 local timestamp 기준을 검증한다. 재배포·rollback은 T0를 바꾸지 않는다.
- Alternatives Considered: 배포 프로세스 시작 시각을 매번 쓰는 안, Remote published를 쓰는 안, 최초 승인 시각만으로 기존 Quote까지 허용하는 안은 비소급 경계를 흔든다.
- Consequences: 오래된 Remote published 값만으로 새 materialization을 과거 저장 Quote로 분류하지 않는다. 이미 저장된 prelaunch Quote의 늦은 승인에는 생성하지 않는다. backfill은 없으며 T0와 같은 시각의 신규 저장은 적용 대상으로 구분한다.
- Confirmation / Follow-up: T0 이전·동일·이후, 도입 전 승인 대기, 도입 후 Remote 승인 대기, 재배포·rollback과 retry를 검증한다. 실제 T0 값은 배포 시 기록한다.

### D5. 기존 Notification interface에 Quote concrete object 추가

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`의 Quote 관계·지정 읽음·권한; PROD-926의 GraphQL 범위, PROD-953의 API 소비 책임. `memory/graphql/identity.md`는 concrete ID·SDL 정렬의 구현 제약이다.
- Status: Active
- Context / Problem: Source를 반환하는 Repost object를 재사용하면 Quote 자체를 가리켜야 하는 계약이 바뀐다.
- Decision Outcome: `QuoteNotification implements Notification & Node`에 기존 공통 필드와 nullable `post: Post`, `profile: Profile!`을 제공한다. post는 Quote 자체의 ID를 기존 Post loader에 전달해 현재 요청 viewer의 조회 정책을 재검증하고, profile은 Quote Author다. Recipient 기준 Notification visibility가 통과해도 selected Profile이 Quote를 볼 수 없으면 post는 null이다. 기존 Reaction/Repost/Reply의 `post`도 concrete Notification inline fragment 간 field conflict를 피하기 위해 nullable GraphQL shape으로 정렬하되 기존 source projection semantics는 유지한다. 기존 root field·read input/payload·cursor 형식을 재사용한다.
- Alternatives Considered: Repost Type 재사용, generic type/raw kind 노출, 별도 Quote 상세 route는 원인·타입 계약에 맞지 않는다.
- Consequences: concrete Node ID·kind·membership·visibility를 함께 검증한다. Notification source row를 직접 Post object로 반환해 Post loader를 우회하지 않는다. runtime schema와 SDL을 동기화하고 UI fragment·표시는 PROD-953이 소유한다.
- Confirmation / Follow-up: 실제 GraphQL operation으로 Node mismatch·권한·pagination·unread·read·오류 원자성을 검증한다.

### D6. 숨김과 물리 정리를 분리하고 공통 예외 유지

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 조회 정책·Quote Notification, `docs/domain/objects/profile-block.md`의 Notification pair 정책, `docs/domain/decisions/0028-quote-notification-policy.md`의 정리 결정; PROD-903, PROD-926, PROD-328.
- Status: Active
- Context / Problem: cleanup은 즉시 성공하지 않으며 Related Quote가 보이는 것만으로 direct Source의 접근 권한을 보장하지 못한다.
- Decision Outcome: 모든 API 표면은 현재 승인·Quote·Source·Related Profile·Recipient mapping과 Block pair를 검사한다. 기존 bounded cleanup은 같은 원인 판정을 사용하고 삭제 직전에 재확인한다. Recipient 자체 일시 비활성화·정지 예외만 유지한다.
- Alternatives Considered: cleanup 완료까지 노출, 모든 제한에서 물리 보존 보장, Quote 전용 보존 예외는 현재 canonical과 충돌한다.
- Consequences: 삭제 전에 회복되면 남은 행이 다시 보일 수 있으나 삭제 후 복원·재생성하지 않는다. 생성 이후 Profile Mute만으로 기존 알림을 변경하지 않는다.
- Confirmation / Follow-up: 모든 API와 cleanup을 같은 원인 상태 matrix로 검증한다.

### D7. Additive 도입과 Quote-aware rollback

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`의 중복 방지·조회 권한·읽음 보존; PROD-926의 다섯 번째 기술적 질문. `memory/database/migrations/workflow.md`는 old/new 호환과 destructive SQL 분리의 구현 제약이다.
- Status: Active
- Context / Problem: enum 추가는 SQL 관점에서 additive여도 구버전 concrete loader·직접 insert writer가 안전하다는 뜻은 아니다.
- Decision Outcome: 기존 schema·데이터 의미를 유지하는 storage 확장 후 Quote-aware reader/cleanup 및 대상 R/Q/M writer를 준비하고 생성 경계를 활성화한다. rollback은 신규 Quote 생성 중지·in-flight drain과 호환 코드 유지로 수행하며 최초 판단·대표 선택·T0를 보존한다.
- Alternatives Considered: enum 제거·판단 삭제 또는 pre-Quote 바이너리 전체 복귀는 duplicate·visibility 계약을 깨뜨릴 수 있다. 이번 change에 destructive contract migration을 넣지 않는다.
- Consequences: activation 전·후와 rollback 기준 버전을 명시해 검증한다. 별도 breaking change가 실제 필요해지면 현재 scope 밖 변경을 자동 수행하지 않고 상위 계약으로 올린다.
- Confirmation / Follow-up: old/new reader·writer 호환, 생성 비활성화·재개, retained judgment 및 접근 제한을 실제 실행으로 검증한다.

### D8. upstream은 최종 통합 증거의 의존성

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: PROD-926의 2026-09-16 Issue Gate·OpenSpec 작성 진행 승인과 검증·archive 책임, PROD-792/924/911/327의 결과 제공 범위; `docs/domain/objects/notification.md`의 Quote lifecycle.
- Status: Active
- Context / Problem: upstream이 준비되지 않았다는 이유로 설계를 멈추거나 fixture 통과를 최종 통합 완료로 과장하면 승인된 전달 순서와 어긋난다.
- Decision Outcome: 독립 설계·구현·검증은 진행할 수 있으며 실제 upstream 결과가 필요한 통합 task는 결과가 준비될 때 수행한다. 미실행을 명시하고 전체 서버 검증 전에는 완료·archive하지 않는다.
- Alternatives Considered: upstream 전체 이슈 Done을 작성 blocker로 두는 안, fake adapter로 통합 완료를 선언하는 안은 사용자 지시에서 제외됐다.
- Consequences: PROD-911의 전체 FCM·UI 완료나 PROD-327의 별도 archive까지 요구하지 않는다. 필요한 실제 서버 결과와 해당 연결 증거는 요구한다. 이번 요청 자체에는 구현 권한이 없다.
- Confirmation / Follow-up: task group 6의 upstream별 실제 경로·실행 결과·미실행 사유를 완료 시 확인한다.

## Remaining Decisions

없음. Spec Gate에서 검토할 Implementation Choice는 D2·D3·D4·D5·D7이며 새로운 제품 선택을 요구하지 않는다. 실제 upstream adapter 경로와 실행 준비 상태는 구현 시 확인할 사실이다. 이 change에는 `Blocked` / `Upstream Change Required` 결정이 없다.

## Superseded Decisions

없음. 작성 전 Issue Gate에서 세 Mute를 blocker로 두었던 설명은 사용자가 이미 정정했다. 이를 이 change의 별도 제품 결정으로 되살리지 않는다.
