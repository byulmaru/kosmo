## 1. PROD-816 System Reserved Handle 정책

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-816

**Deliverable**

서버와 Android·iOS·Web 클라이언트가 같은 System Reserved Handle 목록과 정확 일치 결과를 사용한다.

**Guardrails**

- trim·lowercase 뒤 handle 전체가 예약 식별자와 정확히 일치할 때만 거부한다.
- underscore 제거와 숫자 치환을 예약 식별자에 적용하지 않는다.
- 부분 문자열과 Remote Profile로 적용 범위를 넓히지 않는다.
- Bluesky 공개 자료를 runtime dependency, 자동 동기화 원본 또는 원격 denylist로 사용하지 않는다.

**Verification**

- 모든 예약 식별자의 직접 일치와 대소문자 변형을 단위 검증한다.
- Local handle 문자 형식으로 생성 가능한 현재 앱 최상위 정적 route namespace가 모두 예약되고,
  `follow-requests`와 `profile-edit`는 형식 검증에서 거부되는지 확인한다.
- `supporter`, `cybersecurity`, `administrator_dev`와 기존 길이·문자 형식 회귀를 검증한다.
- 서버와 클라이언트 소비 경계가 별도 예약 목록이나 정규화를 갖지 않는지 확인한다.

- [x] 1.1 공용 Profile validation에 확정된 System Reserved Handle 목록과 판정 계약을 구현한다.
- [x] 1.2 전체 예약 식별자, 대소문자와 정확 일치 허용 경계의 단위 사례를 추가하고 통과시킨다.
- [x] 1.3 현재 앱 최상위 정적 route와 Local handle 문자 형식의 교집합을 System Reserved 목록과 회귀 사례에
      반영한다.

## 2. PROD-816 Explicitly Harmful Handle Expression 정책

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-816

**Deliverable**

서버와 Android·iOS·Web 클라이언트가 같은 Explicitly Harmful Handle Expression 목록과 우회 정규화 결과를
사용한다.

**Guardrails**

- trim·lowercase·underscore 제거 뒤 compact 원본과 `0`→`o`, `1`→`i`, `3`→`e`, `4`→`a` 치환 결과를
  각각 목록 전체와 정확히 비교한다.
- 부분 문자열, Remote Profile, Unicode confusable, 로마자 한국어 욕설과 추가 leetspeak로 범위를 넓히지
  않는다.
- Bluesky 공개 자료를 runtime dependency, 자동 동기화 원본 또는 원격 denylist로 사용하지 않는다.

**Verification**

- 모든 curated 값의 직접 일치와 대소문자, underscore 및 네 숫자 치환 우회를 단위 검증한다.
- `class`, `analysis` 같은 정상 단어와 기존 길이·문자 형식 회귀를 검증한다.
- 서버와 클라이언트 소비 경계가 별도 유해표현 목록이나 정규화를 갖지 않는지 확인한다.

- [x] 2.1 공용 Profile validation에 확정된 Explicitly Harmful Handle Expression 목록과 판정 계약을
      구현한다.
- [x] 2.2 전체 curated 값, 정규화 우회와 정확 일치 허용 경계의 단위 사례를 추가하고 통과시킨다.

## 3. PROD-816 서버 권위 생성 차단

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-816

**Deliverable**

Local Profile 생성 API는 클라이언트 검증 여부와 관계없이 두 정책을 위반한 handle을 쓰기 전에 거부하고 기존
GraphQL field error 계약으로 응답한다.

**Guardrails**

- 오류는 `VALIDATION` code와 `handle` field를 유지하고 일치한 표현, 내부 분류와 전체 목록을 노출하지 않는다.
- 정책 위반 시 Profile과 Owner Membership을 저장하지 않는다.
- 기존 Local Instance 유일성, 원격에만 존재하는 duplicate 허용, payload와 데이터베이스 schema 계약을 바꾸지
  않는다.
- Profile lifecycle이나 향후 handle 재사용 가능 여부가 두 정책을 우회하지 않는다.

**Verification**

- API 직접 호출로 예약 식별자, 명시적 유해표현과 정규화 우회를 제출해 field error와 write 부재를 통합
  검증한다.
- 유효 handle, 부분 문자열 handle, Local duplicate와 remote-only duplicate의 기존 결과를 회귀 검증한다.
- GraphQL input·payload shape와 데이터베이스 schema에 불필요한 변경이 없는지 확인한다.

- [x] 3.1 Local Profile 생성의 서버 validation 경계에 두 공용 정책을 적용하고 쓰기 이전 거부를 보장한다.
- [x] 3.2 직접 API 우회, 정확 일치 허용 경계, 저장 부재와 기존 중복 계약을 다루는 통합 검증을 추가하고
      통과시킨다.

## 4. PROD-816 생성 UI 오류 처리

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/design/accessibility.md`
- PROD-816

**Deliverable**

Android·iOS·Web의 Local Profile 생성 form은 두 정책 위반을 mutation 전에 차단하고, 서버의 최신 정책 거부도
입력값을 보존한 접근 가능한 handle field 오류로 안전하게 표시한다.

**Guardrails**

- 정책 오류 문구는 `사용할 수 없는 단어가 포함된 핸들이에요.`로 통일한다.
- 공용 TextField의 오류 border, input-error 연결과 announcement를 재사용하고 별도 variant나 중복 alert를
  만들지 않는다.
- raw GraphQL·validation 오류, 내부 목록과 일치한 표현을 사용자에게 표시하지 않는다.
- 두 정책 이외의 생성 실패를 정책 오류로 덮어쓰지 않고 기존의 안전한 오류·입력 보존·재시도 동작을 유지한다.

**Verification**

- Storybook interaction에서 예약 식별자와 우회 유해표현의 mutation 미호출, 안전한 field 오류와 입력값 보존을
  검증한다.
- 부분 문자열 handle은 다른 검증을 통과하면 mutation을 호출하고, 최신 서버 거부 응답은 같은 안전한 field
  오류로 수렴하는지 검증한다.
- Web의 invalid/description 연결과 단일 announcement를 확인하고 Android·iOS 공용 렌더 경계의 회귀를
  검증한다.
- Storybook에서 일반 생성 실패, picker 닫기·재열기와 성공 흐름의 기존 동작을 회귀 검증한다.

- [x] 4.1 생성 form이 두 공용 정책과 TextField 오류 계약을 사용하도록 변경하고 사전 검증 실패의 mutation
      호출을 막는다.
- [x] 4.2 구조화된 server field 오류를 안전하게 매핑하고 raw 오류를 노출하지 않으면서 다른 실패 동작을
      보존한다.
- [x] 4.3 정책 거부·허용·서버 정책 차이·접근성·기존 picker 동작의 Storybook 상태와 interaction 검증을
      추가하고 통과시킨다.

## 5. PROD-816 기존 데이터 감사와 통합 완료

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-816

**Deliverable**

배포 전에 configured Local Instance의 기존 Local Profile과 두 정책의 충돌 여부를 안전하게 파악한다. 두
하위 정책의 결과와 통합 증거를 PROD-816에서 함께 추적한다.

**Guardrails**

- 감사에는 실제 적용 정책과 같은 판정 조건을 사용한다.
- 감사 대상은 배포 대상 Local Profile로 제한하며 Profile을 rename, disable, delete하거나 다른 쓰기를
  수행하지 않는다.
- 감사만을 위한 일회성 code나 package script를 저장소에 유지하지 않는다.
- 결과와 log·analytics에 일치한 유해표현을 불필요하게 남기지 않는다.
- 충돌이 발견되면 자동 조치하지 않고 영향·변경 방식·rollback·재점검 조건을 소유하는 별도 cleanup 이슈와
  승인된 forward data migration 또는 운영 절차로 분리한다.
- OpenSpec change는 두 하위 정책의 구현 범위와 감사·통합 검증이 모두 끝난 뒤에만 완료·archive한다.

**Verification**

- 배포 대상 감사 절차가 read-only이고 Remote Profile을 제외하는지 실행 계획과 결과로 입증한다.
- 대상 환경에서 감사한 시점과 정책별 충돌 수를 민감한 일치값 없이 PROD-816에 기록한다.
- Core 단위, API 통합, Storybook interaction·접근성 및 workspace 필수 check 결과를 한 번에 확인한다.

- [x] 5.1 기존 Local Profile 충돌의 read-only 점검, 별도 승인 cleanup과 재점검 정책을 문서화하고 감사만을
      위한 일회성 code와 package script를 저장소에서 제거한다.
- [ ] 5.2 확장된 route 예약 목록으로 배포 대상 Local Instance를 다시 감사하고 두 하위 정책의 결과를
      PROD-816에 기록한다.
- [x] 5.3 Core·API·앱의 집중 검증과 workspace 필수 check를 실행해 두 정책의 통합 결과를 확인한다.
- [ ] 5.4 각 task와 검증 증거를 PROD-816에 동기화하고 두 하위 정책 범위가 모두 완료된 경우에만 delta spec
      동기화와 OpenSpec archive를 수행한다.
