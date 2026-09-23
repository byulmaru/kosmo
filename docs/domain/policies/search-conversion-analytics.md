# Search Conversion Analytics Policy

## 목적과 결정 기록

이 지표는 **검색 결과에서 Profile을 선택한 사람 중 30분 안에 유효한 Profile을 조회하거나 실제 Follow Relationship을 만든 사람의 비율**을 묻는다. 집계 단위는 PostHog person이다. 검색에서 선택한 대상과 이후 행동한 대상이 같을 필요는 없다. 같은 사람이 A·B·C를 선택하고 A·C에서 행동했다면 분모 1명·전환 1명이다. A 선택 뒤 A에서 실패하고 B를 조회해도 그 사람은 전환한 것으로 센다. 이 값으로 개별 검색 결과 선택의 품질이나 대상별 성공률을 해석하지 않는다.

[PROD-557](https://linear.app/byulmaru/issue/PROD-557)의 2026-09-03 승인 댓글 `ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`은 대상 Profile별 journey와 동일 대상 성공 귀속을 명시적으로 승인했다. 2026-09-23 사용자는 PR #998의 리뷰를 검토한 뒤 person 단위 전환율이면 충분하다고 결정해 그 계산 계약을 변경했다. 과거 승인을 person 단위 승인으로 소급하지 않는다. Profile이 Account에 속한다는 관계만으로 검색 대상 간 귀속 문제가 사라지는 것은 아니지만, 현재 제품 질문에는 대상별 귀속이 필요하지 않다.

## 계산 계약

- 분모: 선택한 Asia/Seoul 기간에 `people` 검색 결과의 유효한 Profile 링크를 한 번 이상 명시적으로 선택한 distinct PostHog person 수. 검색 제출·결과 로드·결과의 Follow 버튼 클릭만으로는 분모를 만들지 않는다.
- 전체 분자: 각 분모 person이 첫 유효 선택 이후 30분 안에 어느 유효한 Profile이든 화면에 표시했거나 실제 Follow Relationship의 성공 응답을 받은 사람 수. Profile 조회와 Follow를 모두 해도 한 번만 센다.
- 같은 person의 여러 결과 선택은 기간 안에서 분모를 늘리지 않는다. 선택이 없는 시간 경과·계정 상태 변화만으로 분모를 새로 만들지 않는다.
- 성공은 선택보다 나중에 발생해야 한다. Profile 조회는 유효한 데이터가 실제 화면에 표시된 경우다. route 진입, 자동 pageview, loading, 오류, 대상 없음은 제외한다. Follow는 [Follow Relationship](../objects/follow-relationship.md)이 응답으로 확인된 경우만 포함하고 [Follow Request](../objects/follow-request.md)는 제외한다. 이후 승인·원격 Accept는 이번 범위 밖이다.

PostHog Funnel의 1단계는 `search_result_selected` 중 `tab = people`, 2단계는 유효한 Profile 표시 이벤트 또는 `follow_succeeded` 중 `result = follow`의 OR 조건이다. person 기준, 순차 전환, 30분 conversion window를 적용한다. 결과 기간은 첫 단계 발생 시점으로 묶고 timezone은 PROD-820의 Asia/Seoul을 따른다. 관측 window가 끝나기 전 수치는 잠정치이며 분모가 0이면 데이터 없음으로 표시한다.

## 수집·범위

Profile 표시 이벤트는 유효한 Profile chrome이 표시될 때만 수집한다. 대상별 journey ID, 대상 Profile ID, 검색어, 이름, handle 또는 이들의 파생값을 새 custom 속성으로 보내지 않는다. 기존 SDK의 Account 기반 identify와 표준 Search `q`·click/referrer/session metadata 계약은 유지한다. 인증 사용자의 PostHog person은 Account identity를 사용하며 선택 Profile은 별도 집계 단위가 아니다.

현재 수집·Funnel은 웹을 대상으로 한다. PROD-557은 이 계산 정의, 필요한 표시 계측, Funnel 설정과 검증을 소유한다. 검색·Profile·Follow UX, 추천·랭킹·개인화, 이전 이벤트명·property 호환성, 전체 북극성 지표는 포함하지 않는다. 공통 PostHog 개인정보·운영 전환은 PROD-795와 그 후속 이슈의 책임이다.
