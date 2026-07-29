## 1. PROD-469 Web 분석 기반과 identity

**Authority / Provenance**

- `PROD-469`

**Deliverable**

Client ID가 있는 Kosmo Web은 OpenPanel 자동 수집과 10% replay를 시작하고, 로그인 Account identity와 성공한 로그아웃 생명주기를 반영한다.

**Guardrails**

- Client ID가 없거나 native인 경우 client와 분석 전송을 만들지 않는다.
- Account의 opaque ID만 identity로 사용한다.
- 모든 입력값과 canonical Post Content를 replay에서 마스킹한다.
- 분석 실패는 인증·렌더링·navigation을 실패시키지 않는다.

**Verification**

- Client ID 유무, identify·clear, replay 설정과 Post Content mask를 unit test와 typecheck로 검증한다.

- [x] 1.1 Web 전용 OpenPanel dependency와 Client ID 기반 초기화를 구현한다.
- [x] 1.2 Session의 Account identify, 로그인 성공, 로그아웃 clear를 구현한다.
- [x] 1.3 자동 수집과 10% replay 설정, 입력·Post Content 마스킹을 구현한다.
- [x] 1.4 분석 기반·identity·failure isolation test를 추가한다.

## 2. PROD-469 핵심 행동과 검색 계측

**Authority / Provenance**

- `PROD-469`

**Deliverable**

Web의 Profile 생성·선택, Post 생성, Follow와 검색 흐름이 실제 성공 시 허용된 속성의 이벤트를 한 번 기록한다.

**Guardrails**

- 실패한 mutation과 검색 load는 성공 이벤트를 만들지 않는다.
- 이름·handle·검색어·Post 본문·오류 원문을 명시적 이벤트 속성으로 보내지 않는다.
- 기존 mutation, 검색, pagination, navigation 동작을 변경하지 않는다.

**Verification**

- 성공·실패 callback과 검색 제출·첫 페이지·결과 선택 event payload를 component test로 검증한다.

- [x] 2.1 허용된 이벤트명과 속성을 제한하는 공통 event 계약을 구현한다.
- [x] 2.2 Profile·Post·Follow 성공 이벤트를 기존 성공 경계에 연결한다.
- [x] 2.3 검색 제출·결과 load·선택 이벤트를 검색어 없이 연결한다.
- [x] 2.4 핵심 행동과 검색 계측의 성공·실패 test를 추가한다.

## 3. PROD-469 개인정보 처리방침과 운영 절차

**Authority / Provenance**

- `PROD-469`
- 개인정보보호위원회 「개인정보 처리방침 작성지침」 2026.4 개정

**Deliverable**

비로그인 방문자도 실제 Kosmo·OpenPanel 처리 내용을 반영한 개인정보 처리방침을 읽을 수 있고, 운영자는 Account별 분석 데이터 삭제 요청을 안전하게 처리할 수 있다.

**Guardrails**

- 고지는 실제 자동 수집, identity, replay 설정과 보유·권리 행사 절차에 일치해야 한다.
- landing과 인증 후 menu 모두에서 접근할 수 있어야 한다.
- 삭제 절차는 대상 확인, dry-run, 승인, 삭제와 잔존 검증을 포함해야 한다.

**Verification**

- 공개 route 렌더링, 두 진입 링크와 필수 고지 항목을 test로 확인하고 runbook 절차를 검토한다.

- [x] 3.1 공개 개인정보 처리방침 route와 landing·menu 진입 링크를 구현한다.
- [x] 3.2 OpenPanel production 설정·검증과 Account별 삭제 runbook을 작성한다.
- [x] 3.3 production Web build의 Client ID 주입을 구성한다.
- [x] 3.4 개인정보 처리방침 route와 진입 링크 test를 추가한다.

## 4. PROD-469 통합 검증과 인계

**Authority / Provenance**

- `PROD-469`

**Deliverable**

변경 범위의 정적·자동 검증이 통과하고, production에서 확인할 수동 acceptance 절차가 명확하다.

**Guardrails**

- Android·iOS와 재게시·반응·북마크 구현을 현재 변경에 포함하지 않는다.
- 실제 production Client ID나 인증 정보를 repository에 저장하지 않는다.

**Verification**

- 관련 unit/component test, typecheck, lint를 실행하고 production dashboard·replay 확인 절차를 기록한다.

- [x] 4.1 관련 unit/component test와 app typecheck·lint를 통과시킨다.
- [x] 4.2 production dashboard에서 수행할 수동 acceptance checklist를 완성한다.
- [x] 4.3 Linear PROD-469에 구현·검증 결과와 후속 이슈를 인계한다.
