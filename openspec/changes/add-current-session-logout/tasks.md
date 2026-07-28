## 1. PROD-474 현재 Session 폐기 server 경계

**Authority / Provenance**

- `docs/domain/objects/session.md`
- `docs/domain/objects/account.md`
- `PROD-344`
- `PROD-473`
- `PROD-474`

**Deliverable**

Native bearer client의 GraphQL mutation과 Web HttpOnly cookie client의 same-origin logout BFF가 같은 current-session revoke 계약을 사용해, 폐기 또는 이미 인증 불가능한 결과를 확정하고 결과 불명 실패와 구분한다.

**Guardrails**

- 인증 경계가 `Session.Self`로 식별한 현재 Active Session만 폐기하며 client Session ID 입력을 받지 않는다.
- Suspended Account의 현재 Active Session 폐기만 `Account.Active`의 예외로 허용하고 일반 보호 행동의 Active Account 정책은 유지한다.
- Revoked/Expired terminal 상태를 재활성화하거나 같은 Account의 다른 Session을 변경하지 않는다.
- GraphQL과 BFF는 같은 transport-neutral revoke core 계약을 사용한다.
- Web은 exact same-origin POST에서만 cookie credential을 처리하고, 결과가 확정된 response에서만 기존 scope의 HttpOnly cookie를 제거한다.
- database schema, Session 폐기 시각·감사 이력과 원격/전체 로그아웃을 추가하지 않는다.

**Verification**

- core에서 Active→Revoked, 중복·만료 경쟁, terminal 보존, 다른 Session 격리와 폐기 credential 거부를 검증한다.
- API에서 Active/Suspended/Deleted Account와 Active/Revoked/Expired Session 조합, input 없는 payload와 결과 불명 error를 검증한다.
- BFF에서 Origin, POST/405, 204/no-store, cookie scope·제거, cookie 없음/terminal 상태와 failure cookie 보존을 검증한다.
- API schema 생성, 관련 typecheck·lint와 database 격리 test를 통과시킨다.

- [x] 1.1 current-session credential 결과와 Active→Revoked core 계약을 구현한다.
- [x] 1.2 중복·경쟁·terminal 상태·다른 Session 격리와 폐기 뒤 인증 거부를 core 검증으로 증명한다.
- [x] 1.3 input 없는 `revokeCurrentSession` GraphQL mutation과 완료/error 계약을 구현하고 API schema·integration 검증을 통과시킨다.
- [x] 1.4 same-origin `POST /logout` BFF와 확정 결과의 HttpOnly cookie 제거 계약을 구현하고 BFF 검증을 통과시킨다.
- [x] 1.5 PROD-474 범위의 typecheck·lint·관련 test 결과와 공개 계약 변경 사항을 PROD-473에 전달한다.

## 2. PROD-475 공용 Expo logout 연결

**Authority / Provenance**

- `docs/domain/objects/session.md`
- `PROD-473`
- `PROD-474`
- `PROD-475`

**Deliverable**

full/compact/drawer의 공용 로그아웃 control이 Web에서는 logout BFF를, Android/iOS에서는 GraphQL mutation을 사용하고, 결과가 확정된 뒤 credential과 viewer 종속 Relay 상태를 정리해 비인증 화면으로 전환한다.

**Guardrails**

- Web UI는 HttpOnly cookie를 읽거나 직접 조작하지 않고 Native token은 기존 SecureStore 경계로만 제거한다.
- server 결과가 확정되기 전에 local credential, Relay Environment/Store 또는 authenticated route를 제거하지 않는다.
- 결과 불명 실패에서는 credential과 현재 viewer 상태를 유지하고 재시도를 제공한다.
- 이전 viewer Relay cache를 guest 또는 다음 Session에 재사용하지 않는다.
- 모든 shell surface는 하나의 pending/error 상태를 공유해 중복 server 요청을 막고 접근 가능한 상태를 제공한다.
- 메뉴 스타일·배치 개편과 Android·iOS production 배포를 포함하지 않는다.

**Verification**

- Web과 Native가 각 runtime server 경계를 호출하고 이미 인증 불가능한 결과를 성공으로 정리하는지 검증한다.
- 성공 시 credential cleanup→새 guest Relay Environment/Store→`/` replace 순서와 다음 Session cache 격리를 검증한다.
- network/server failure에서 credential·Environment·route 유지, 오류 안내, 재시도와 중복 실행 방지를 검증한다.
- full/compact/drawer control의 press, busy/disabled, 실패 안내와 접근성 상태를 검증한다.
- Relay compile, client typecheck·lint, Web export/E2E와 2026-07-29 Web production smoke 결과를 남긴다.

- [ ] 2.1 Web BFF와 Native GraphQL을 선택하는 공용 runtime logout action을 구현한다.
- [ ] 2.2 확정된 성공 뒤 credential과 Relay Environment/Store를 정리하고 `/`로 replace 이동하는 흐름을 구현한다.
- [ ] 2.3 full/compact/drawer logout control에 공용 action, 중복 방지와 접근 가능한 진행·실패·재시도 상태를 연결한다.
- [ ] 2.4 Web·Native 성공/이미 비인증/결과 불명/중복 실행/cache 격리 검증과 Relay compile·client check를 통과시킨다.
- [ ] 2.5 2026-07-29 Web production 배포 뒤 logout smoke 결과를 PROD-473에 전달한다.

## 3. PROD-473 종단 간 통합 검증과 archive 준비

**Authority / Provenance**

- `docs/domain/objects/session.md`
- `docs/domain/objects/account.md`
- `PROD-344`
- `PROD-473`
- `PROD-474`
- `PROD-475`

**Deliverable**

PROD-474와 PROD-475의 독립 구현 결과가 Web cookie와 Native bearer runtime에서 하나의 current-session logout 사용자 결과를 완성하며, 기존 로그인·Session 교환을 회귀시키지 않고 OpenSpec archive 준비 상태에 도달한다.

**Guardrails**

- 두 구현 자식은 각자 구현·테스트·PR을 완료하고, 부모는 자식 test를 단순 반복하지 않고 연결된 사용자·시스템 흐름을 검증한다.
- 폐기된 credential은 거부되고 같은 Account의 다른 Session은 유지되어야 한다.
- 결과 불명 실패를 성공으로 표시하거나 credential을 제거해서는 안 된다.
- Android·iOS production 배포는 완료 조건이 아니며 Web production smoke만 소비한다.
- 모든 current change task, 구현 PR, 통합 검증과 authority 정합성이 완료되기 전에는 archive하지 않는다.

**Verification**

- Web에서 cookie Session 폐기, cookie 제거, Relay guest 전환, 재시도와 보호 route 비인증 전환을 종단 간 확인한다.
- Native에서 bearer Session 폐기, SecureStore 정리, Relay guest 전환과 같은 Account의 다른 Session 보존을 통합 확인한다.
- browser login callback, Native OIDC exchange, currentSession 조회와 기존 보호 GraphQL 경로의 회귀 검증을 통과시킨다.
- 최신 canonical·Linear·delta specs·decisions·tasks 정합성과 strict validation을 archive 직전 다시 확인한다.

- [ ] 3.1 PROD-474와 PROD-475가 각자 소유한 구현·테스트·PR 및 전달 증거가 완료됐는지 확인한다.
- [ ] 3.2 Web cookie와 Native bearer의 current-session logout 종단 간 흐름 및 다른 Session 격리를 통합 검증한다.
- [ ] 3.3 기존 browser login, Native Session exchange, currentSession과 보호 API 회귀 검증을 통과시킨다.
- [ ] 3.4 최신 canonical·Linear와 OpenSpec 정합성, 남은 Blocked decision 부재와 strict validation을 확인해 Completion Gate archive 검토 자료를 준비한다.
