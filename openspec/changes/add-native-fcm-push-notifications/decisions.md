## Context

이 기록은 `docs/domain/decisions/0029-native-push-notification-policy.md`와
`docs/design/notifications.md`에 반영된 PROD-875 제품 결정, `docs/domain/objects/notification.md`의 기존
Recipient·visibility·Read State 계약, 그리고 PROD-875/912/913/914 본문·관계를 하나의 native FCM Push
capability에 적용한 결과다. 모든 기록은 현재 상위 authority에서 파생한 계약이며, 아래에 기록한 PROD-913
native client 경계를 제외한 Provider SDK·endpoint·DB schema·retry 수치 같은 구현 선택은 이 문서에서 결정하지
않는다. PROD-912의 승인된 server-issued installation row ID와 GraphQL mutation surface는 sibling 구현이
공유해야 하는 lifecycle 계약으로 기록한다.

## Decision Records

### Canonical Notification의 공통 Push 전달 흐름을 사용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-914`
- Status: Active
- Context / Problem: 인앱 Notification과 Push가 별도 Type whitelist 또는 source별 lifecycle을 가지면 현재
  runtime 범위가 갈라지고 새 canonical type마다 Push 전달 구현이 복제된다.
- Decision Outcome: 저장 성공한 canonical Notification 결과를 공통 Push 전달 flow로 넘기고, 현재 Notification
  runtime이 생성·제공하는 모든 Notification에 같은 수신 대상·권한·privacy·lifecycle 계약을 적용한다. 현재
  runtime 유형은 닫힌 whitelist가 아니며, 향후 type은 해당 domain owner가 생성·source·표시·target 계약을 연결한
  뒤 같은 flow를 사용한다. 별도 유형별 선택·제외 control을 만들지 않으며, 미래 generator 자체나 PROD-911 Mention
  생성·통합을 이 change에서 구현하지 않는다.
- Alternatives Considered: 고정 Type 목록이나 source별 Push lifecycle은 현재 runtime과 drift하고 새 type마다
  구현을 복제한다. 미래 generator를 선행 구현하는 방식은 PROD-875 범위를 확장하므로 선택하지 않는다.
- Consequences: 공통 flow는 저장 성공 이후 수신 대상 fan-out, 기존 visibility·권한 적용, preview privacy, expiry,
  no-backlog, retry·dedup와 원본 실패 격리를 소유한다. 각 type의 생성 권한·source semantics·표시 연결은 해당
  domain owner가 소유한다.
- Confirmation / Follow-up: 현재 5개 runtime generator를 integration inventory로 검증하고, 향후 canonical type을
  공통 flow에 연결할 때 source별 전달 lifecycle을 복제하지 않는지 확인한다.

### 로그인된 첫 실행의 안내와 명시적 CTA를 사용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-913`
- Status: Active
- Context / Problem: 앱 시작이나 로그인 완료만으로 OS 권한을 열면 사용자의 동의 시점과 이미 로그인된 설치의 첫 실행을 구분할 수 없다.
- Decision Outcome: 로그인된 상태의 첫 앱 실행에 Push 안내를 표시한다. 새 로그인 완료 직후와 이미 로그인된 상태의 실행을 포함할 수 있으며, 안내를 위해 logout·relogin을 요구하지 않는다. OS 권한 요청은 안내의 `알림 받기` action에서만 시작한다.
- Alternatives Considered: 앱 시작·로그인 완료 자동 prompt와 logout/relogin을 요구하는 방식은 명시적 동의 경계를 흐리고 기존 session lifecycle을 흔드므로 선택하지 않는다.
- Consequences: native client는 안내 표시와 OS 권한 호출을 분리하고 installation-local 안내 상태를 보존해야 한다.
- Confirmation / Follow-up: Android·iOS signed build에서 신규 로그인과 이미 로그인된 설치의 첫 실행, CTA 이전 no-prompt를 확인한다.

### 기본 Push에는 sender·type·body preview를 사용하고 bodyless excerpt를 생략한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914`
- Status: Active
- Context / Problem: 잠금 화면 표시가 알림 이유와 원인 게시글을 설명해야 하지만 Follow·FollowRequest에는 게시글 본문이 없다.
- Decision Outcome: 기본 표시에는 sender와 Notification type, 게시글 본문이 있는 경우 body preview를 포함하고, Follow·FollowRequest처럼 body가 없는 경우 게시글 excerpt만 생략한다. sender·type·Recipient Profile 식별은 유지한다.
- Alternatives Considered: bodyless 알림에 임의 본문을 만들거나 sender/type까지 제거하는 방식은 canonical 표시 의미를 잃으므로 선택하지 않는다.
- Consequences: excerpt 길이·자르기 규칙은 후속 결정으로 남지만 no-body 처리와 identity 표시 구조는 고정된다.
- Confirmation / Follow-up: body가 있는 일반 Notification과 Follow·FollowRequest payload를 각각 확인한다.

### Account의 모든 Profile과 Recipient Profile 식별을 유지한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914`
- Status: Active
- Context / Problem: selected Profile만 수신 범위로 사용하면 같은 Account의 다른 Profile Notification이 누락되고 Push 탭의 target Profile을 결정할 수 없다.
- Decision Outcome: 현재 Account에 속한 모든 Profile을 수신 범위로 유지하고 각 Push에 어느 Recipient Profile의 Notification인지 식별할 수 있는 정보를 포함한다.
- Alternatives Considered: selected Profile만 전달하거나 Account 수준으로 Profile identity를 제거하는 방식은 다중 Profile 수신과 tap routing을 깨뜨리므로 선택하지 않는다.
- Consequences: 대상 계산과 payload·tap 검증은 Recipient Profile identity를 보존해야 한다.
- Confirmation / Follow-up: 두 Profile의 동시 수신과 cross-profile tap에서 올바른 Profile 전환을 확인한다.

### 모든 eligible 로그인 설치에 fan-out한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-914`
- Status: Active
- Context / Problem: 최신 설치 하나만 선택하면 사용자의 여러 현재 설치에서 Push가 누락된다.
- Decision Outcome: 현재 Account에 로그인되어 있고 OS 알림을 허용한 모든 Android·iOS 앱 설치를 대상으로 하며, 가장 최근 설치 하나만 선택하지 않는다.
- Alternatives Considered: most-recent-only 정책은 multi-device 수신을 임의로 축소하므로 선택하지 않는다.
- Consequences: Provider 전달은 installation별 fan-out과 partial outcome을 관측해야 한다.
- Confirmation / Follow-up: 둘 이상의 eligible installation token으로 전달 대상과 partial failure를 확인한다.

### 첫 릴리스는 OS 설정만 Push 제어 경계로 사용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`
- Status: Active
- Context / Problem: in-app global·type·Profile preference를 추가하면 OS 권한과 별도 상태가 생겨 첫 릴리스의 제어 경계가 갈라진다.
- Decision Outcome: 전역·알림 유형별·Profile별 in-app Push switch 또는 preference API를 제공하지 않고, Push 수신 제어는 OS 알림 설정이 소유한다. 앱 설정은 OS 알림 설정으로 이동하는 action만 제공한다.
- Alternatives Considered: in-app global/type/Profile switch와 preference API는 현재 제품 계약에 없는 별도 상태를 추가하므로 선택하지 않는다.
- Consequences: native UX는 OS 상태를 관찰·동기화하고 별도 Push preference storage를 만들지 않는다.
- Confirmation / Follow-up: Android·iOS 설정 이동과 in-app switch 부재를 실제 signed build에서 확인한다.

### 기존 Mute·Block·visibility 억제와 권한 semantics를 유지한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-914`
- Status: Active
- Context / Problem: Push target selection이 기존 Notification의 조회·생성 억제 정책을 우회하면 인앱과 OS 표면의 개인정보 경계가 달라진다.
- Decision Outcome: 기존 Notification의 Mute·Block·visibility 억제, 수신자 소유권과 현재 조회 권한 semantics를 Push 대상 선택에 적용한다. 이 change는 기존 정책을 전면 재설계하지 않는다.
- Alternatives Considered: Push 전용 예외 목록이나 별도 suppression policy는 canonical Notification 계약을 복제하고 drift를 만들므로 선택하지 않는다.
- Consequences: server target selection은 기존 domain policy를 재사용하거나 같은 결과를 independently 검증해야 한다.
- Confirmation / Follow-up: 억제·권한 없음 대상이 Provider 호출에서 제외되고 허용된 대상만 남는지 확인한다.

### sensitive·Content Warning은 body만 가리고 authorized private body는 허용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914`
- Status: Active
- Context / Problem: 잠금 화면과 OS banner의 body는 민감할 수 있지만 sender, type, Recipient Profile identity는 알림 이유를 설명하는 정보다.
- Decision Outcome: sensitive 또는 Content Warning인 경우 body만 가리고 sender·type·Recipient Profile 식별은 유지한다. sensitive·Content Warning이 아닌 private body는 Recipient 조회 권한이 확인된 경우 표시한다.
- Alternatives Considered: 전체 Push를 숨기거나 권한 있는 private body까지 일괄 제거하면 확정된 기본 preview와 구분된 privacy 계약을 충족하지 못한다.
- Consequences: payload builder는 body redaction과 Recipient authorization을 분리하고 token·private body를 일반 로그·analytics에 남기지 않는다.
- Confirmation / Follow-up: sensitive/CW, authorized private, unauthorized private 각 payload와 로그를 확인한다.

### Foreground에서도 OS banner를 표시한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-913`
- Status: Active
- Context / Problem: foreground 수신을 custom in-app banner로 별도 구현하면 OS notification surface와 알림 동작이 달라진다.
- Decision Outcome: 앱이 foreground인 경우에도 OS notification banner를 표시하고 별도 custom in-app Push banner를 추가하지 않는다.
- Alternatives Considered: custom in-app banner는 첫 릴리스에 없는 별도 surface와 상태를 만들므로 선택하지 않는다.
- Consequences: native notification presentation delegate와 OS 설정이 foreground 표시를 소유한다.
- Confirmation / Follow-up: Android·iOS foreground signed build에서 OS banner가 나타나고 custom banner가 없음을 확인한다.

### 같은 설치의 안내 반복을 억제한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-913`
- Status: Active
- Context / Problem: 안내를 닫거나 권한을 거부한 뒤 또는 일반 업데이트 뒤 같은 설치에 자동 prompt를 반복하면 명시적 동의 경계가 훼손된다.
- Decision Outcome: 같은 설치에서 안내를 닫거나 OS 권한을 거부한 뒤, 일반적인 앱 업데이트 뒤에는 안내를 자동으로 다시 표시하지 않는다.
- Alternatives Considered: 앱 업데이트·매 launch마다 prompt를 반복하는 방식은 확정된 반복 억제 계약과 충돌하므로 선택하지 않는다.
- Consequences: installation-local 안내 완료·dismiss·deny 상태를 업데이트와 Account 재로그인 흐름에서 보존해야 한다.
- Confirmation / Follow-up: CTA close, OS deny와 일반 update를 각각 같은 설치에서 반복 실행해 자동 안내가 없는지 확인한다.

### cross-profile tap은 접근 재검증 뒤 Profile 전환·target 이동을 수행한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-913`
- Status: Active
- Context / Problem: Push가 생성된 뒤 Account membership 또는 target visibility가 바뀔 수 있어 탭 payload만 신뢰할 수 없다.
- Decision Outcome: 로그인된 tap은 exact Push envelope를 먼저 검증하고, `logged-in/exact envelope` → Notification Node network revalidation → `selectProfile` → `resetActor` → derived route/fallback 순서를 따른다. `recipientProfileId`는 Profile Relay Global ID이며, Node가 삭제되었거나 접근할 수 없으면 접근 가능한 Notification 목록으로 수렴하고 toast·message를 표시하지 않는다.
- Alternatives Considered: stale payload를 바로 열거나 old-valid/duplicate 상태에도 자동 목록 fallback을 적용하면 현재 권한과 다른 navigation을 만들므로 선택하지 않는다.
- Consequences: native tap handler는 exact envelope와 현재 로그인 상태를 확인한 뒤 Notification Node를 네트워크에서 재검증하고, 그 성공 결과로 Profile 전환과 actor reset을 거쳐 derived route를 계산해야 한다. logged-out tap은 별도 결정처럼 일반 login으로 수렴한다.
- Confirmation / Follow-up: cross-profile valid target, deleted target, inaccessible target의 signed build evidence를 분리한다.

### logged-out tap은 target을 버리고 일반 login으로 수렴한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-913`
- Status: Active
- Context / Problem: 로그아웃 상태에서 Push target을 보존하면 login 뒤 stale 또는 권한이 달라진 destination을 자동으로 열 수 있다.
- Decision Outcome: logged-out 상태의 Push tap은 원래 target을 버리고 일반 로그인 흐름을 따른다. 로그인 뒤 원래 Push target으로 자동 복귀하지 않는다.
- Alternatives Considered: login 후 target resume은 tap 당시 권한과 현재 Account 상태의 차이를 숨기므로 선택하지 않는다.
- Consequences: native login flow는 Push navigation state를 재개 queue로 보존하지 않는다.
- Confirmation / Follow-up: logged-out tap 뒤 일반 login 화면과 로그인 완료 후 target 미복귀를 실제 기기에서 확인한다.

### 원본 생성 시각 기준 expiry와 Provider 경계를 분리한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914`
- Status: Active
- Context / Problem: retry나 token refresh 때 expiry를 다시 계산하면 오래된 Notification이 새 전달 대상으로 되살아나고, Provider API 응답을 실제 도착 또는 이미 큐잉된 메시지의 회수로 해석하면 관찰 가능한 경계를 넘는다.
- Decision Outcome: 최초 Notification 생성 시각부터 24시간이 지나면 Push 전달을 시도하지 않으며, retry·backoff·token refresh로 expiry를 연장하거나 다시 시작하지 않는다. expiry는 원래 인앱 Notification lifecycle을 변경하지 않는다. Provider accepted·queued 결과는 실제 기기 도착이나 절대적 회수의 증거로 주장하지 않고, Provider response·workflow outcome·device arrival evidence를 별도로 관측한다.
- Alternatives Considered: registration 또는 마지막 retry 시각을 기준으로 expiry를 재시작하거나 accepted를 사용자 도착으로 집계하고 queued message retract를 보장하는 방식은 no-backlog·원본 lifecycle 또는 관찰 가능한 Provider 경계를 깨므로 선택하지 않는다.
- Consequences: delivery attempt는 원본 `createdAt`을 기준으로 판정하고 retry scheduler는 그 경계를 넘기지 않는다. E2E 보고서와 운영 관측은 accepted·arrival·retract를 별도 결과로 기록한다.
- Confirmation / Follow-up: 경계 전·후 retry와 token refresh에서 전달 시도와 인앱 row 상태를 확인하고, fake/provider response와 실제 signed Android·iOS arrival evidence를 분리해 검증한다.

### Read State는 Push 전송을 필터링하거나 변경하지 않는다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-914`
- Status: Active
- Context / Problem: 다른 표면에서 Notification을 Read로 만든 사실이 Push delivery의 독립적인 시도와 canonical Read State를 바꾸면 표면별 계약이 갈라진다.
- Decision Outcome: 현재 Read 상태라는 이유만으로 Push send·retry를 제외하거나 취소하지 않고, Push 전달 자체가 canonical Read State를 변경하지 않는다.
- Alternatives Considered: unread-only send gate, Read 시 retry cancellation 또는 Push 수신 시 Read mutation은 명시된 read independence와 충돌하므로 선택하지 않는다.
- Consequences: delivery query와 retry state는 Read State와 독립적으로 검증하고, Push tap의 화면 이동이 별도 기존 Read 계약을 임의로 변경하지 않게 한다.
- Confirmation / Follow-up: 이미 Read인 item, 다른 표면에서 Read된 item, Push 전달 후 Read State를 각각 확인한다.

### registration 이후 생성된 Notification만 전달하고 backlog를 재생하지 않는다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914`
- Status: Active
- Context / Problem: 새 설치·device·permission activation 때 과거 unread를 자동 replay하면 사용자가 기대하지 않은 과거 Push를 받게 된다.
- Decision Outcome: 최초 registration, 새 device 또는 OS 권한 허용으로 전달 대상을 등록할 때 registration을 받은 시점 이후 생성된 Notification만 전달한다. 이미 생성된 unread Notification은 backlog로 재생하지 않으며, client는 관찰 가능한 OS 상태를 동기화한다.
- Alternatives Considered: 기존 unread 전체 replay 또는 정확한 OS 상태 변화 시각을 서버가 추론하는 방식은 확정된 no-backlog와 관찰 가능성 경계를 벗어나므로 선택하지 않는다.
- Consequences: 등록 시점과 Notification 생성 시각의 순서를 delivery eligibility에 사용하고, OS 상태 감지 구현의 세부 방식은 native slice에 남긴다.
- Confirmation / Follow-up: 새 registration·권한 허용 전후 Notification과 client가 관찰한 OS permission 상태를 실제 기기에서 확인한다.

### PROD-912 installation token은 active row만 보관하고 폐기 시 즉시 삭제한다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-912`
- Status: Active
- Context / Problem: invalid·unregistered token이나 logout·account switch 뒤 token row를 tombstone으로 남기면 민감한 token 보관 기간이 불필요하게 늘고, 삭제 뒤 재등록이 이전 수신 epoch와 backlog를 잘못 재사용할 수 있다.
- Decision Outcome: active installation row만 opaque token을 보관한다. 명시적 unregister는 인증된 Account·installation ID ownership만 확인한 뒤 row와 token을 같은 원자적 작업에서 즉시 삭제한다. 등록 당시 연결된 `sessionId`는 lifecycle association으로 유지하며 현재 인증 Session과 비교하거나 요청 Session으로 재바인딩하지 않으므로 같은 Account의 다른 Session도 row를 관리할 수 있다. Session 폐기와 Account 삭제는 기존 auth·deletion lifecycle의 정리 순서와 Session→installation FK cascade로 row를 삭제한다. Provider invalid/unregistered 결과는 Account·installation ID·현재 token이 모두 일치할 때만 row와 token을 즉시 삭제하며, 이전 token 결과는 갱신된 현재 token과 일치하지 않으면 아무 row도 삭제하지 않는다. 삭제 뒤 재등록은 새 registration epoch를 기록하고 삭제 전 Notification을 전달하지 않는다.
- Alternatives Considered: `INVALID`·`UNREGISTERED` tombstone과 token 보관은 수신 eligibility를 조회에서만 제외하면서 민감정보 retention과 stale-token 경계를 남긴다. 오래된 token 결과를 installation ID만으로 삭제하면 token refresh 이후의 새 token을 지울 수 있다.
- Consequences: Push installation table에는 active registration만 남고 invalidation·logout·account deletion은 실제 `DELETE`를 수행한다. Provider invalidation은 Account·installation ID·token을 함께 조건으로 사용한다. 기존 Session revoke와 Account 삭제 lifecycle을 재설계하지 않고 해당 경로에서 installation cleanup을 호출한다.
- Confirmation / Follow-up: Session `REVOKED`·`EXPIRED`, Account 삭제의 기존 sessions-first 정리와 FK cascade, explicit unregister, matching·stale Provider invalidation과 same-Account reinstall을 실제 DB에서 검증했다. Account 비활성은 기존 auth·eligibility semantics를 유지하며 별도 물리삭제 lifecycle을 추가하지 않는다. Provider SDK와 retry 수치는 PROD-914가 소유한다.

### PROD-912 registration ID는 서버가 발급하고 재사용하지 않는다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-912`
- Status: Active
- Context / Problem: 외부 installation ID를 등록 입력으로 재사용하면 늦은 unregister가 같은 식별자를 가진 새 registration row에 영향을 줄 수 있다.
- Decision Outcome: 최초 registration은 외부 installation ID 없이 서버가 새 installation row ID를 발급한다. update는 반환된 ID와 인증된 현재 Account가 소유한 row에만 적용하며, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 노출하지 않는 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패한다. unregister는 인증된 현재 Account가 소유한 row만 삭제하며, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 노출하지 않고 `{ completed: true }`로 멱등 완료한다. 등록 당시 연결된 `sessionId`는 lifecycle association으로 유지하고 요청 Session으로 재바인딩하지 않는다. 기존의 현재 Account·Session 관리 조건은 Account-only 권한 확인과 unknown·foreign ID의 row 존재를 노출하지 않는 update 실패·unregister 완료 규칙으로 대체한다. 재등록은 항상 새 row ID와 새 registration epoch를 사용하므로 늦은 이전 ID의 unregister가 새 row를 삭제하지 않는다.
- Alternatives Considered: client가 발급한 stable installation ID를 재사용하거나 unregister에서 token·ID 없이 Account의 설치를 추측하는 방식은 늦은 해제의 대상 경계를 보장하지 못하므로 선택하지 않는다.
- Consequences: client는 최초 register 응답의 row ID를 저장해 이후 update·unregister에 사용한다. 같은 Account의 다른 Session도 Account 소유 row를 관리할 수 있지만 registration 당시 연결된 Session association은 바뀌지 않는다. 같은 Account의 active token 중복은 기존 row를 원자적으로 삭제한 뒤 새 row ID로 등록하며, Provider invalidation은 row ID와 현재 token을 함께 확인한다.
- Confirmation / Follow-up: register→unregister→register 순서에서 ID 비재사용, stale unregister 격리와 no-backlog·새 epoch를 API/DB에서 검증한다. GraphQL field shape와 GlobalID 인코딩은 별도 Implementation Choice로 기록한다.

### PROD-912 GraphQL mutation은 server-issued ID를 `PushInstallation` GlobalID로 노출한다

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-912`, `packages/core/db`, repository GraphQL GlobalID conventions
- Status: Active
- Context / Problem: server-issued row ID lifecycle을 GraphQL client가 사용할 공개 ID와 mutation surface로 연결해야 한다.
- Decision Outcome: `registerPushInstallation(input: { platform, token })`은 `{ id: ID! }`를 반환한다. `updatePushInstallation(input: { id: ID!, platform, token })`과 `unregisterPushInstallation(input: { id: ID! })`은 반환된 `PushInstallation` GlobalID를 입력으로 사용하며, 별도 Node/query/registry는 추가하지 않는다.
- Alternatives Considered: 외부 installation ID를 입력으로 유지하거나 PushInstallation Node/query/registry를 추가하는 방식은 server-issued ID lifecycle의 최소 경계와 현재 사용 사례를 확장하므로 선택하지 않는다.
- Consequences: register 응답은 후속 update·unregister의 cacheable public ID를 제공하고, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID의 update는 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패하며, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID의 unregister는 `{ completed: true }`로 멱등 처리한다. GraphQL scalar·typename 검증은 API boundary가 소유하고 core token lifecycle은 transport-neutral 상태를 유지한다.
- Confirmation / Follow-up: repository의 `field.globalID`와 `t.input.globalID()` 관행, `PushInstallation` typename 인코딩, register/update/unregister의 unknown/deleted ID 결과를 API integration에서 확인한다.

### PROD-913 native SDK ownership을 분리한다

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-913`
- Status: Active
- Context / Problem: FCM token lifecycle과 OS 권한·표시·tap callback을 여러 native SDK가 함께 소유하면 같은 token 등록, foreground 이중 표시 또는 중복 tap 처리가 발생할 수 있다.
- Decision Outcome: React Native Firebase Messaging(`@react-native-firebase/messaging`)이 FCM token 발급과 `onTokenRefresh`를 단독으로 소유한다. Expo Notifications(`expo-notifications`)가 OS permission 요청·상태 조회, foreground OS presentation과 notification response/tap callback을 단독으로 소유한다. Notifee는 추가하거나 사용하지 않는다. 각 SDK가 같은 token, foreground event 또는 tap event를 중복 등록·처리하지 않는다.
- Alternatives Considered: Expo Notifications만으로 direct FCM token lifecycle을 소유하거나 Notifee를 presentation·tap 계층에 추가하는 방식은 이 capability가 요구하는 FCM token 경계 또는 단일 OS presentation/tap ownership을 흐리므로 선택하지 않는다.
- Consequences: native client의 token lifecycle과 permission/status·foreground/tap lifecycle은 서로 다른 명확한 경계를 가지며, Provider SDK·credential·retry는 PROD-914의 책임으로 남는다.
- Confirmation / Follow-up: SDK 설정과 callback 연결은 implementation slice에서 확인한다. signed Android·iOS build에서 token refresh, permission 상태, foreground OS banner와 tap callback의 중복 없는 실행 및 iOS FCM–APNs device arrival은 아직 검증하지 않았다.

### PROD-913 client unregister는 OS 해제와 저장 ID가 함께 있을 때만 수행한다

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-912`, `PROD-913`
- Status: Active
- Context / Problem: OS 설정에서 권한이 해제된 경우에만 client가 해당 installation을 해제해야 하며, 저장된 server-issued installation ID가 없으면 해제 대상을 추측할 수 없다. logout cleanup은 client permission 동기화와 분리된 server session lifecycle의 권위로 남아야 한다.
- Decision Outcome: client는 관찰된 OS permission이 revoked이고 저장된 installation ID가 있을 때에만 `unregisterPushInstallation`을 호출한다. unregister가 성공한 뒤에만 local installation ID를 삭제한다. logout 시 installation row cleanup의 권위는 server session revocation이며, client permission 동기화 unregister가 logout cleanup을 대체하거나 선행하지 않는다.
- Alternatives Considered: logout·앱 시작·ID 부재 때마다 unregister를 호출하거나 mutation 전에 local ID를 지우는 방식은 server session cleanup 경계 또는 실패 후 재시도 가능성을 훼손하므로 선택하지 않는다.
- Consequences: OS permission drift를 관찰한 client만 저장된 대상에 대해 idempotent unregister를 시도하고, 성공하지 않은 호출 뒤에는 ID를 보존해 재시도할 수 있다. server session revocation은 client 상태와 무관하게 기존 logout cleanup을 수행한다.
- Confirmation / Follow-up: revoked permission과 stored/missing installation ID 조합, 성공·실패 unregister 뒤 local ID 보존·삭제, logout의 server session revocation cleanup을 signed Android·iOS와 API integration에서 확인해야 하며 현재 signed device 검증은 실행하지 않았다.

### PROD-913 prompt 완료 상태는 AsyncStorage marker 하나로 보존한다

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-913`
- Status: Active
- Context / Problem: 로그인·업데이트마다 권한 안내를 다시 표시하면 close·deny 이후 자동 반복 억제 계약을 지키기 어렵고, Account·Profile·서버에 prompt UI 상태를 추가하면 설치 로컬 정책이 흐려진다.
- Decision Outcome: 앱은 prompt가 완료된 사실을 나타내는 app-local AsyncStorage marker 하나만 기록한다. marker는 prompt의 close 또는 `알림 받기` action에서 permission 요청 결과가 끝난 뒤 설정하며, Account·Profile별 상태나 서버 API·Push installation 데이터로 복제하지 않는다. marker가 있으면 일반 로그인·앱 실행·업데이트에서 안내를 자동으로 다시 표시하지 않는다.
- Alternatives Considered: SecureStore·서버 preference·Account/Profile별 marker를 사용하는 방식은 설치 로컬 prompt 완료 경계를 바꾸거나 이미 확정된 in-app Push preference 상태를 추가하므로 선택하지 않는다.
- Consequences: marker는 OS permission status나 FCM token eligibility를 대신하지 않으며, 앱은 매 native lifecycle에서 Expo Notifications로 관찰한 OS 상태를 별도로 처리한다. AsyncStorage의 플랫폼별 uninstall/reinstall 및 backup/restore 동작은 signed physical installation identity를 보장하지 않을 수 있으므로, strict install-level once를 backup 복원까지 일반화하지 않는다.
- Confirmation / Follow-up: signed Android·iOS build에서 신규 로그인·기존 로그인 설치의 첫 실행, close·deny·CTA, 일반 update, uninstall/reinstall과 backup/restore를 확인해야 한다. 현재 이 검증은 실행하지 않았다.

### PROD-913 Push tap은 Profile Relay GID와 기존 전환·재검증 경계를 사용한다

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-913`
- Status: Active
- Context / Problem: Push payload의 Recipient Profile을 임의의 local ID로 해석하거나 별도 tap API를 추가하면 Relay actor와 기존 Notification 권한·route 재검증이 분리된다.
- Decision Outcome: Push payload의 `recipientProfileId`는 Profile Relay Global ID를 사용한다. 로그인된 tap은 exact Push envelope를 먼저 검증하고 `logged-in/exact envelope` → Notification Node network revalidation → `selectProfile` → `resetActor` → derived route/fallback 순서를 따른다. Node가 삭제되었거나 접근할 수 없으면 기존 Notification 목록 fallback으로 수렴한다. 새로운 tap resolver, Node/query/registry 또는 다른 API surface를 추가하지 않는다.
- Alternatives Considered: raw database UUID 또는 client-local Profile ID를 payload에 넣거나 tap 전용 API·navigation queue를 추가하는 방식은 Relay identity·기존 authorization boundary를 복제하고 logged-out/cross-profile 처리 경계를 넓히므로 선택하지 않는다.
- Consequences: native tap handler는 payload의 Recipient Profile identity를 Relay 경계에서 사용하고 로그인 상태·exact envelope를 확인한 뒤 Notification Node를 네트워크에서 재검증한다. 그 다음 `selectProfile` → `resetActor`를 수행하고 derived route 또는 기존 목록 fallback을 선택한다. logged-out tap은 기존 일반 login 수렴을 따르며 target을 보존하지 않는다.
- Confirmation / Follow-up: cross-profile valid target, deleted/inaccessible target, logged-out tap을 signed Android·iOS build에서 확인해야 하며 현재 이 검증은 실행하지 않았다.

## Remaining Decisions

- Provider SDK·service credential 주입·secret rotation, retry/backoff 수치, deduplication key와 운영 관측 field.
- 기존 source Workflow가 Notification materialization 전에 시작 실패하는 관측 경계와, canonical Notification
  저장 성공 결과를 공통 전달 flow로 넘긴 뒤 복구 불가능한 추가 post-commit 외부 start window 없이 Provider
  전달을 실행할 수 있는지.
- Android·iOS signed-build evidence와 uninstall/reinstall·backup/restore에서 AsyncStorage marker의 실제 보존 동작.
- iOS FCM–APNs provisioning/entitlement와 실제 device arrival evidence.
- 게시글 body excerpt의 길이·자르기 규칙(ADR 0029의 남은 결정). 현재 Push 범위와 no-body 계약의 blocker가 아니다.

## Superseded Decisions

없음.
