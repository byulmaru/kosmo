# Search Conversion Analytics Policy

## 목적과 근거

검색 결과 선택이 실제 Profile 조회 또는 Follow로 이어지는 비율을 같은 탐색 단위로 계산한다.
[PROD-557](https://linear.app/byulmaru/issue/PROD-557)의 2026-09-03 승인 댓글
`ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`이 계산 계약과 소유권의 근거다.
이 정책은 취소된 PROD-520의 전체 북극성 지표나 WAA를 정의하지 않는다.

## 계산 단위

- 분모는 같은 검색 결과 맥락에서 선택한 대상 [Profile](../objects/profile.md)별 journey다.
- 같은 대상의 재선택과 뒤로가기는 중복 제거하고, 다른 대상 선택은 별도 journey로 센다.
- 전체 전환 분자는 최초 선택 후 30분 이내 같은 journey·대상의 조회 또는 Follow가 성공한 journey 수다.
- 조회와 Follow가 모두 성공해도 전체 전환은 한 번이다. 조회 전환율과 Follow 전환율은 같은 분모로 따로 계산한다.

## 성공 조건

Profile 조회는 유효한 Profile 데이터를 실제 화면에 표시했을 때 성공이다. route 진입, URL 변경, 자동 pageview,
loading, 조회 실패나 대상 없음은 성공이 아니다. 검색에 실패해 결과를 선택하지 못하면 journey 분모도 생기지 않는다.

Follow는 실제 [Follow Relationship](../objects/follow-relationship.md)이 응답으로 확인된 경우만 성공이다.
[Follow Request](../objects/follow-request.md)는 승인 대기이므로 성공에 포함하지 않는다. 이후 수신자 승인이나
원격 Accept를 따로 추적해 검색 전환에 귀속하는 것은 현재 범위에서 제외한다.

## 귀속 기간과 종료

최초 선택 후 정확히 30분인 성공까지 포함한다. 재선택으로 최초 선택 시각이나 관측 기간을 연장하지 않는다.
아래 경계 중 먼저 발생한 시점부터 새 성공을 귀속하지 않는다.

- 최초 선택 후 30분 경과.
- 새 검색.
- Account, 선택 Profile 또는 인증 상태 변경.
- PostHog session 변경.
- 탭 종료 또는 전체 reload.

종료 전에 기록한 분모와 성공은 유지한다. 종료 뒤 도착한 늦은 응답을 이전 또는 새 journey에 연결하지 않는다.
앱의 인증 [Session](../objects/session.md)과 PostHog session은 별도 경계로 다룬다.
탭 간 journey 공유와 reload 뒤 복원은 하지 않으며, 선택 맥락을 전달받지 않은 새 탭·별도 navigation은 기존
journey에 연결하지 않는다.

## 집계 기간과 표시

journey 시작 시점을 기준으로 기간을 묶고, timezone은 PROD-820이 정한 Asia/Seoul을 따른다. 성공이 다음 날짜에
발생해도 귀속 기간 안이면 시작 날짜의 journey에 포함한다. 마지막 journey의 관측 window가 끝나기 전 결과는
잠정치로 표시한다. 분모가 0이면 데이터 없음으로 표시한다.

## 수집 경계

journey의 귀속값은 Account·Profile·검색어에서 파생하지 않은 불투명 값이다. custom 귀속 속성으로 raw 검색어,
이름, handle, 대상 Profile ID를 보내지 않으며, 대상 ID의 hash나 암호화 대체값도 보내지 않는다.
기존 SDK identity 계약을 유지한다.

PROD-819·820이 승인한 PostHog 표준 Search `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인
metadata 수집은 별도 계약으로 유지한다. custom 속성 제한을 표준 metadata 전체 차단으로 확대하지 않는다.

## 범위와 책임

PROD-557은 이 계산 정의, 탐색 귀속 계측, 단위·회귀 검증과 초기 PostHog funnel·dashboard 재현을 소유한다.
검색·Profile·Follow UX, 추천·랭킹·개인화, 이전 이벤트명·property 호환성, 전체 북극성 지표와 다른 제품 지표는
포함하지 않는다. 공통 PostHog 개인정보·운영 전환은 PROD-795와 그 인계를 받은 이슈의 책임이다.
