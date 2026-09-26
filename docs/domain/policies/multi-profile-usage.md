# Multi-Profile Usage Policy

## 정의

Multi-Profile Usage Policy는 durable 객체가 아니라 Account, Profile, Account-Profile Membership과 제품
행동 관측을 함께 소비해 멀티 Profile 사용 지표를 계산하는 조회 정책이다. 이 정책은 Profile 보유와 실제
사용을 구분하며 기존 Membership, Profile 선택, Post 작성, Follow 동작을 바꾸지 않는다.

이 정책의 지표는 production Web 관측만 사용한다. 이름, handle, Post Content, 검색 원문이나 Follow 대상
Profile 식별자를 지표를 위해 새로 수집하지 않는다.

## 관측 기간

- 한 주는 Asia/Seoul 기준 월요일 00:00 이상부터 다음 월요일 00:00 미만이다.
- 수신 시각이 아니라 행동이 일어난 시각으로 주차를 정한다. 늦게 수신한 관측은 행동이 일어난 주에 넣는다.
- 진행 중인 주는 부분 집계로 표시하고, 초기 비교는 완료된 주끼리 한다.
- 완료된 주도 조회 시점까지 수신된 관측과 최신 제외 목록으로 다시 계산한다. 결과에는 관측 기간, 집계 실행
  시각, 계산 규칙 버전과 제외 목록 버전을 함께 표시한다.
- 같은 Account가 여러 Session이나 기기를 사용해도 Account 수는 한 번만 센다.
- SDK 차단이나 전송 실패로 수집하지 못한 행동을 추정하지 않는다.

## 기본 집합

### 주간 활성 Account

주간 활성 Account(WAA)는 해당 주에 다음 관측이 하나 이상 있는 distinct Account다. 관측 시점에 인증된
Account만 포함하며, 나중에 로그인했다는 이유로 익명 관측을 소급하지 않는다.

- 인증된 화면 조회
- Profile 생성 성공
- Profile 선택 성공
- Post 생성 성공
- Follow 실행 성공
- 검색 제출, 결과 로드 또는 결과 선택

자동 클릭 수집, Session Replay, pageleave, performance, feature flag와 SDK 진단 이벤트만 있는 Account는
WAA로 세지 않는다. 실패한 요청만 있는 경우도 마찬가지다. 이 WAA는 이 정책의 지표에만 적용하며 다른
진단 지표나 북극성 지표의 공통 분모를 정하지 않는다.

### 사용 가능 Profile

사용 가능 Profile은 Account와 Account-Profile Membership으로 연결돼 있고, selected Profile에 적용하는
조회 가능 조건을 충족하는 Profile이다. Local과 Remote를 구분하지 않으며 Owner와 Member Role을 모두 포함한다.

멀티 Profile 대상 WAA는 해당 주 안의 한 시점 이상에서 서로 다른 사용 가능 Profile 2개 이상을 동시에 가진
WAA다. 이 자격은 Profile 사용 횟수나 행동량과 무관하게 Membership과 조회 가능 상태로만 판단한다. 서로
다른 시점에 하나씩만 사용할 수 있었던 Profile을 합쳐 자격을 만들지 않는다.

주차가 바뀐 뒤 화면, 선택 Profile과 사용 가능 Profile이 그대로여도 새 주에 WAA 포함 대상 행동이 발생하면
그 주의 자격을 함께 확인해야 한다. 화면을 다시 열지 않았다는 이유로 WAA에만 포함하고 대상 WAA에서
누락하지 않는다. 자격 확인만으로 새 화면 조회나 선택 Profile 사용이 있었다고 간주하지 않는다.

### 사용한 Profile

Account별로 다음 관측 중 하나가 있는 Profile을 그 주에 사용한 Profile로 센다.

- 인증된 화면을 조회할 때 선택되어 있던 Profile
- 선택을 성공적으로 마친 Profile
- Post 생성 또는 Follow 실행에 성공한 행동 주체 Profile

같은 Account와 Profile 조합은 그 주에 한 번만 센다. 생성 성공만으로는 사용으로 보지 않으며, 선택 성공,
화면 조회 또는 핵심 행동이 별도로 확인돼야 한다. 다른 Account의 Profile 사용을 가져와 사용 Profile 수를
채우지 않는다.

멀티 Profile 활성 Account는 멀티 Profile 대상 WAA이면서 한 주에 서로 다른 Profile 2개 이상을 사용한
Account다.

## 핵심 지표

### 멀티 Profile 활성 사용률

멀티 Profile 기능을 실제로 쓸 수 있었던 Account의 채택 정도를 보는 주 지표다.

```text
멀티 Profile 활성 사용률
= 멀티 Profile 활성 Account 수 / 멀티 Profile 대상 WAA 수 × 100
```

분자는 반드시 분모에 속해야 한다. 한 주에 Profile 2개를 사용했더라도 같은 시점에 선택 가능한 Profile이
2개 이상이었던 사실을 확인할 수 없으면 이 비율에 넣지 않는다. 분모가 0이면 0% 대신 계산할 수 없음으로
표시한다.

### 멀티 Profile 도달률

전체 제품 활동에서 멀티 Profile 사용이 차지하는 폭을 보는 보조 지표다.

```text
멀티 Profile 도달률
= 멀티 Profile 활성 Account 수 / WAA 수 × 100
```

이 비율은 단일 Profile Account가 늘면 낮아질 수 있다. 기능 채택 여부를 판단할 때 활성 사용률과 바꿔 쓰지
않고, WAA와 멀티 Profile 대상 WAA의 절대 수를 함께 본다. 분모가 0이면 계산할 수 없음으로 표시한다.

## 리텐션과 절대 수

주간 비율의 변화를 리텐션으로 해석하지 않는다. 다음 지표를 별도로 계산한다.

- 기능 리텐션: 처음 멀티 Profile 활성 Account가 된 주의 집단 가운데 W+1과 W+4에 다시 멀티 Profile 활성
  Account가 된 비율
- 대상 Account 제품 리텐션: 기준 주의 멀티 Profile 대상 WAA 가운데 W+1과 W+4에 다시 WAA가 된 Account
  비율
- 절대 수: WAA, 멀티 Profile 대상 WAA, 멀티 Profile 활성 Account의 주간 distinct Account 수

W+1과 W+4는 기준 주와 같은 Asia/Seoul 주차를 사용한다. 아직 해당 주가 끝나지 않았다면 미도래로 표시한다.
각 리텐션 분모가 0이면 계산할 수 없음으로 표시한다.

## 생성과 전환

Profile 생성 횟수는 생성이 실제로 성공한 횟수다. 생성 뒤 자동 선택이 실패해도 생성 성공은 유지한다. 주간
생성 총횟수와 해당 주에 Profile을 1개 이상 생성한 distinct Account 수를 함께 표시한다. 같은 Account가
Profile을 2회 생성했다면 생성 총횟수는 2, distinct 생성 Account 수는 1이다. 이는 Profile 생성의 집계이며
새 Account 생성 관측을 요구하지 않는다.

Profile 전환은 이미 선택한 Profile이 있는 상태에서 Account가 다른 기존 Profile을 직접 선택해 성공한 경우다.
다음 선택은 전환 횟수에서 제외한다.

- 같은 Profile 재선택
- 선택 Profile이 없을 때의 첫 선택
- 새 Profile 생성 직후의 자동 선택
- Session 복원이나 화면 재조회
- 취소되거나 실패한 선택

주간 전환 총횟수와 멀티 Profile 활성 Account당 평균 전환 횟수를 함께 표시한다. 평균의 분모에는 해당 집단의
전환 0회 Account도 포함한다. 집단이 비어 있으면 계산할 수 없음으로 표시한다. 생성 뒤 자동 선택이
성공했다면 사용 Profile에는 포함할 수 있지만 전환으로 세지 않는다. 평균의 분자는 멀티 Profile 활성
Account 집단의 직접 전환 횟수 합계다. 활성 Account A와 B 중 A가 직접 전환 2회, B가 0회이고 다른 전환이
없다면 주간 직접 전환 총횟수는 2, 활성 Account당 평균은 1이다.

## 핵심 행동과 귀속

초기 핵심 행동은 Post 생성과 Follow 실행 성공이다. Follow 결과는 즉시 Follow Relationship이 생긴 경우와
Follow Request가 생긴 경우로 나눠 표시한다.

행동은 원래 행동 주체 Profile과 인증 Account에 귀속한다. 처리 중 선택 Profile이나 로그인 Account가 바뀌어도
다른 주체의 행동으로 옮기지 않는다. 원래 주체를 확정할 수 없는 관측은 임의로 귀속하지 않는다. 방문한
Profile이나 Follow 대상 Profile은 사용한 Profile이 아니다.

같은 성공 관측의 전송 재시도는 한 번만 세고, 별도로 성공한 행동은 각각 센다. 같은 시각이나 같은 Profile을
이유로 서로 다른 행동을 합치지 않는다.

## 제외 대상과 개인정보

- 익명 관측과 development·test 환경 관측은 제외한다.
- 내부·테스트 Account와 알려진 봇·자동화 Account는 접근이 제한된 운영 제외 목록으로 관리한다.
- 모든 지표에 같은 제외 목록 버전을 적용한다. 최신 목록을 과거 주에도 적용하므로 새 제외 Account를 등록하면
  이전 수치가 달라질 수 있다.
- Account를 제외할 때는 그 Account의 모든 활동만 제외한다. 같은 Profile을 사용하는 다른 Account까지
  제외하지 않는다.
- 목록에 없는 자동화를 모두 식별했다고 주장하지 않으며 이름, handle 또는 IP 주소로 새로운 제외 규칙을
  추정하지 않는다.
- 앱 소유 지표 관측에는 opaque Account ID와 행동 주체 또는 선택 Profile ID만 사용한다. Account ID는 기존
  분석 식별자를 사용하고 이벤트 속성으로 중복 추가하지 않는다.
- 위 추가 수집 금지는 PROD-555가 정의하는 application-defined/custom analytics properties에 적용한다.
  기존 승인된 분석 계약과 PostHog SDK가 생성·유지하는 URL·referrer 등의 standard metadata를 이 지표
  때문에 제거하거나 필터링하지 않는다. 기존 개인정보·분석 계약을 이 정책에서 재설계하지 않는다.
- 실제 제외 목록은 저장소 문서에 복제하지 않는다.

## 운영과 책임

- PROD-555는 이 정책, 필요한 이벤트 변경, 초기 Insight와 대시보드, 합성 데이터 대조, 실제 수집 데이터의
  계약 대조를 맡는다.
- 담당자는 매주 완료된 직전 주의 결과와 제외 목록을 확인한다.
- PROD-555의 완료는 지표 구현, 검증과 운영 인수 결과를 기준으로 판단한다. OpenSpec 정리는 제품 완료 조건에
  포함하지 않는다.
- PROD-795의 개인정보·운영 통합 검증은 production 수집 인수의 선행 조건으로 유지한다.
- 기본 PostHog 전환의 production 인수 검증과 archive는 PROD-575가 계속 맡는다.

## 제외/보류

- Profile 기능, Membership, 선택 동작과 전환 화면의 변경
- 북극성 지표 선정과 다른 지표의 공통 WAA 정의
- 과거 OpenPanel 이벤트와의 호환 또는 이전 수치 이관
- Repost, Reaction, Bookmark를 초기 핵심 행동에 추가하는 일
- Native 분석 지원

## 확정 용어

- 주간 활성 Account: WAA
- 멀티 Profile 대상 WAA: 한 주 안의 한 시점 이상에서 사용 가능 Profile 2개 이상을 동시에 가진 WAA
- 멀티 Profile 활성 Account: 멀티 Profile 대상 WAA이면서 한 주에 서로 다른 Profile 2개 이상을 사용한
  Account
- 멀티 Profile 활성 사용률: 멀티 Profile 대상 WAA 가운데 멀티 Profile 활성 Account의 비율
- 멀티 Profile 도달률: WAA 가운데 멀티 Profile 활성 Account의 비율
