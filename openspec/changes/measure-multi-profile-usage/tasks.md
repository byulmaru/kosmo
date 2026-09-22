## 1. PROD-555 인증 화면의 멀티 Profile 문맥 관측

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)

**Deliverable**

production Web의 인증 화면 조회에서 현재 선택 Profile과 멀티 Profile 자격을 Account identity에 한 번 연결할
수 있다. 같은 화면에서 새 KST 주차의 WAA 포함 행동이 발생해도 그 주의 자격을 확인할 수 있다.

**Guardrails**

- 사용 가능 Profile은 Membership과 기존 조회 가능 조건으로 판단한다.
- Local·Remote, Owner·Member를 임의로 제외하지 않는다.
- custom 속성에는 관측 종류, 자격 boolean과 화면 조회의 선택 Profile ID만 추가한다. 자격 확인만으로
  WAA·사용 Profile을 만들지 않는다. Account ID, Profile 목록, 이름, handle, Post Content, 검색 원문,
  Follow 대상 Profile ID와 pathname을 custom 속성으로 복제하지 않는다.
- 기존 승인된 SDK URL·referrer 등의 standard metadata는 제거하거나 필터링하지 않는다.
- 표준 PostHog pageview와 Native no-op 경계를 바꾸지 않는다.

**Verification**

- 타입이 정해진 이벤트의 허용·거부 조합과 Web 전달, Native no-op을 단위 검증한다. `eligibility`에는
  선택 Profile ID가 없고 WAA·사용 Profile의 독립 근거가 되지 않는지 확인한다.
- custom 속성의 금지 항목 부재와 기존 SDK standard metadata 보존을 별도로 검증한다.
- Profile 0·1·2개, 선택 Profile 없음과 여러 shell 형태에서 전송 이벤트 수와 속성을 브라우저로
  확인한다.
- `pnpm --filter @kosmo/app check`, 관련 unit·Storybook 검증을 통과시킨다.

- [ ] 1.1 인증 화면의 선택 Profile·멀티 Profile 자격을 표현하는 타입이 정해진 이벤트 계약을 추가한다.
- [ ] 1.2 단일 shell 관측자에서 실제 화면 조회와 자격 확인을 구분한다. 모든 WAA 포함 typed 호출 경계를
      연결하고 행동 시각의 Account·KST 주차·자격을 비교해 새 주의 첫 행동에서도 자격을 관측한다. 같은
      상태의 중복 실행을 막고 이전 주 자격의 자동 이월이나 주차 변경만으로 생기는 관측을 만들지 않는다.
- [ ] 1.3 Profile 0·1·2개, 선택 없음, route 재방문과 shell 중복 렌더를 검증한다. 일요일 검색 화면을 유지한
      채 월요일에 동일 검색을 재제출하면 새 주 WAA·대상 WAA가 각각 1이고 자격 확인만으로 사용 Profile이
      늘지 않음을 검증한다. 같은 주 반복 행동과 다른 WAA 포함 호출부에도 이 경계를 확인한다.

## 2. PROD-555 Profile 생성·선택·직접 전환 분류

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)

**Deliverable**

생성 성공과 선택 성공을 독립적으로 보존하면서 서로 다른 기존 Profile 사이의 직접 전환만 별도로 셀 수 있다.

**Guardrails**

- 같은 Profile 재선택, 첫 선택, 생성 직후 자동 선택, Session 복원·화면 재조회, 실패와 취소는 전환에서
  제외한다.
- 생성 뒤 자동 선택이 실패해도 생성 성공은 유지한다.
- 선택 성공 Profile은 사용 관측으로 남길 수 있다.

**Verification**

- 첫 선택, 재선택, 직접 전환, 생성 자동 선택 성공·실패와 mutation 실패의 이벤트 조합을 검증한다.
- 출발·도착 Profile ID가 다른 직접 전환에서만 전환 이벤트가 한 번 발생하는지 확인한다.
- 기존 ProfileSwitcher Storybook 상호작용과 브라우저 전환 흐름을 함께 통과시킨다.

- [ ] 2.1 선택 요청의 출발 Profile, 도착 Profile과 직접 선택·생성 자동 선택 원인을 성공 시점까지 보존한다.
- [ ] 2.2 서로 다른 기존 Profile 사이의 직접 선택 성공만 전환으로 관측하고 기존 선택 성공 관측은 유지한다.
- [ ] 2.3 생성 성공 뒤 자동 선택 성공·실패와 모든 전환 제외 사례를 검증한다.

## 3. PROD-555 핵심 행동 주체와 재전송 중복 방지

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)

**Deliverable**

Profile 생성·선택·Post·Follow 성공을 원래 인증 Account와 행동 주체 Profile에 귀속하고 같은 논리적 성공의
재전송을 한 번만 센다.

**Guardrails**

- 완료 전에 Account나 선택 Profile이 바뀌어도 다음 주체로 옮기지 않는다.
- 현재 Account identity가 시작 시점과 다르면 잘못 귀속하지 않는다.
- Follow Relationship과 Follow Request 결과를 구분한다.
- Account ID와 Follow 대상 Profile ID를 앱 소유 속성으로 추가하지 않는다.
- 공개 PostHog API만 사용하며 분석 이벤트 전송 실패를 제품 흐름으로 전파하지 않는다.

**Verification**

- mutation 도중 Profile·Account 전환, 동일 콜백·transport 재시도와 별도 성공 두 건을 검증한다.
- 이벤트 종류별 고정 UUID와 최초 성공 관측 시각이 전송 페이로드에 전달되고 재시도에서 유지되는지 확인한다.
- 로그인 전 관측이 person 병합 후에도 WAA로 소급되지 않고, 중복 행이 남은 집계에서도 한 번만 세는지 확인한다.
- Post·Follow 성공 페이로드에 원래 행동 주체 Profile과 기존 결과 구분 외의 식별 정보가 없는지 확인한다.

- [ ] 3.1 논리적 작업마다 시작 Account, 행동 주체 Profile과 이벤트별 UUID를 고정하고 최초 성공 관측 시각을
      보존해 타입이 정해진 분석 이벤트 경계로 전달한다.
- [ ] 3.2 Profile 생성·선택, Post 생성과 Follow 실행 성공 호출부가 시작 시점의 주체를 사용하도록 맞춘다.
- [ ] 3.3 Account·Profile 전환과 재전송에서도 오귀속·중복이 없고 제품 흐름이 계속되는지 검증한다.

## 4. PROD-555 합성 집계 검증

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)

**Deliverable**

승인된 주간 집합, 비율, 리텐션, 생성·전환·핵심 행동 규칙을 합성 자료에서 독립적으로 재현할 수 있다.

**Guardrails**

- Asia/Seoul 월요일 경계와 행동 발생 시각을 사용한다.
- 멀티 Profile 활성 Account는 대상 WAA의 부분집합이어야 한다.
- 분모 0은 계산할 수 없음, 끝나지 않은 W+1·W+4는 미도래로 처리한다.
- 최신 제외 목록을 과거 주에도 적용한다.

**Verification**

- 주간 경계, 동일 화면의 새 주 행동·반복 행동·행동 없는 주, 지연 수신, 여러 기기, Profile 0·1·2개, 생성 뒤
  선택 실패, 전환 제외, 재전송, Account 전환과 제외 목록 변경을 포함한 기대표를 대조한다.
- Account A의 Profile 생성 2회는 생성 총횟수 2·distinct 생성 Account 1이어야 한다.
- 활성 Account A/B의 직접 전환 2회·0회이고 다른 전환이 없으면 총횟수 2·활성 Account당 평균 1이어야 한다.
  활성 집단이 비어 있으면 평균은 계산 불가다. 이벤트 발생 여부만 검증하고 완료 처리하지 않는다.
- WAA 10, 대상 WAA 4, 활성 Account 2에서 50%와 20%가 각각 나오는지 확인한다.
- 합성 결과에는 관측 기간, 집계 실행 시각, 계산 규칙과 제외 목록 버전을 포함한다.

- [ ] 4.1 승인된 경계 사례를 포함하는 결정적 합성 이벤트 자료와 기대 결과를 만든다.
- [ ] 4.2 주간 Account 집합, 활성 사용률·도달률, 절대 수와 W+1·W+4 리텐션을 독립 계산해 기대표와
      대조한다.
- [ ] 4.3 Profile 생성 총횟수·distinct 생성 Account 수, 직접 전환 총횟수·활성 Account당 평균, Post·Follow와
      중복 제거 결과를 같은 자료에서 대조한다. 생성 2·생성 Account 1, 전환 2·평균 1을 기대값으로 고정하고
      평균의 0회 Account 포함과 빈 집단을 검증한다.

## 5. PROD-555 PostHog 쿼리·대시보드와 제외 목록

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)

**Deliverable**

PostHog에서 승인된 주간 Account 집합과 지표를 같은 제외 목록으로 조회하고 운영 대시보드에서 비교할 수 있다.

**Guardrails**

- 활성 사용률을 주 지표, 도달률을 보조 지표로 표시한다.
- WAA, 대상 WAA, 활성 Account의 절대 수와 두 리텐션을 별도로 표시한다.
- 실제 Account 제외 목록은 저장소에 복제하지 않는다.
- 자동화 Account를 이름·handle·IP 주소로 추정하지 않는다.
- 진행 중인 주를 부분 집계로 표시하고 실행 시각·계산 규칙·제외 목록 버전을 남긴다.

**Verification**

- 저장 쿼리 결과를 4번의 합성 기대표와 대조한다.
- 제외 Account 추가 전후 과거 주 수치와 같은 Profile을 쓰는 다른 Account의 유지 여부를 확인한다.
- 대시보드의 두 비율, 세 절대 수, 생성·전환·핵심 행동과 리텐션 정의를 서로 대조한다.

- [ ] 5.1 접근이 제한된 운영 제외 목록의 첫 버전과 담당자·점검 절차를 만든다.
- [ ] 5.2 같은 제외 목록과 중복 제거를 적용한 뒤 Account × KST week의 자격·사용 Profile 수·생성·전환을
      HogQL에서 결합한다. 자격 전용 관측을 WAA·Profile 사용에서 제외하고 독립 Trends의 최종 수치 조합이나
      별도 영속 DB·materialized table을 추가하지 않는다.
- [ ] 5.3 두 비율, 세 절대 수, Profile 생성 총횟수·distinct 생성 Account 수, 직접 전환 총횟수·활성 Account당
      평균, 핵심 행동과 두 리텐션을 각각 표시한다. 평균은 활성 집단의 전환 합계 / 전환 0회도 포함한 활성
      Account 수로 계산한다. 새 Account 생성 이벤트는 추가하지 않는다.
- [ ] 5.4 실제 저장 쿼리와 대시보드 출력을 4번의 명시적 기대값, 실행 metadata와 제외 목록 변경으로
      검증한다. 총횟수와 함께 생성 Account 수와 평균도 검증한다.

## 6. PROD-555 production 실수집 인수와 주간 운영

**Authority / Provenance**

- `docs/domain/policies/multi-profile-usage.md`
- [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- [Linear PROD-795](https://linear.app/byulmaru/issue/PROD-795)

**Deliverable**

PROD-795 통합 검증 뒤 production 실수집 관측이 승인된 identity·Profile 귀속·자격·전환·개인정보 계약을
따르는지 확인하고 완료된 직전 주를 정기 점검할 수 있다.

**Guardrails**

- 합성 검증을 production 실수집 인수로 대신하지 않는다.
- 이름, handle, Post Content, 검색 원문, Follow 대상 Profile ID와 실제 제외 목록을 증거에 남기지 않는다.
  PROD-555 custom 속성의 금지 항목 부재와 기존 SDK standard metadata 보존은 별도로 확인한다.
- SDK 차단·전송 실패로 누락된 행동을 추정하거나 완전 수집이라고 주장하지 않는다.
- PROD-795가 끝나기 전에는 production 수집 인수를 완료하지 않는다.

**Verification**

- 개인정보 없는 전송 또는 PostHog 스키마 증거로 허용 이벤트·속성·identity를 확인한다.
- 실제 Account 흐름에서 두 Profile 사용, 직접 전환, 생성, Post와 Follow 결과를 대시보드 집계와 대조한다.
- 완료된 직전 주 보고에 부분 집계 여부, 실행 시각과 두 버전이 있는지 확인한다.

- [ ] 6.1 PROD-795의 Done 근거를 다시 확인하고 PROD-555 자체 production 관측 시작점을 기록한다.
- [ ] 6.2 production 실수집 페이로드에서 Account identity, 선택·행동 주체 Profile, 자격, 직접 전환과 개인정보
      경계를 대조한다.
- [ ] 6.3 production 실수집 집계와 표본 행동을 개인정보 없는 증거로 대조하고 알려진 수집 한계를 기록한다.
- [ ] 6.4 완료된 직전 주의 대시보드와 제외 목록을 확인하는 주간 점검을 실행하고 인계한다.

## 7. 선택적 세션 정리

현재 `AGENTS.md`와 `memory/issue-openspec-workflow.md`를 따른다. 이 항목은 구현·PR·production 인수의
완료 조건이 아니며, task 수를 채우기 위해 별도 이슈나 PR을 만들지 않는다.

- 실제로 남은 요구사항과 production 검증은 handoff에 보존한다.
- 필요하면 구현 PR 안에서 `--skip-specs`로 archive한다. 별도 delta spec 동기화를 요구하지 않는다.
- PROD-575의 기본 PostHog production 인수 책임은 계속 구분한다.
