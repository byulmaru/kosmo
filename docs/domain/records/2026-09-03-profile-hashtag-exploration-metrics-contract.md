# 2026-09-03 Profile Hashtag 탐색 지표 승인 기록

## 복원 경위

2026-09-22 현재 main과 조회한 Git 이력에는 이전 handoff가 가리킨 정책·기록·OpenSpec 파일이 없다.
이 문서는 과거 파일의 원문 복원이 아니라 현재 Linear에서 확인한 승인 사실의 재기록이다.
현재 정책은 [Profile Hashtag 탐색 지표](../policies/profile-hashtag-exploration-analytics.md)가 소유한다.

## 확인한 승인

[PROD-556](https://linear.app/byulmaru/issue/PROD-556) 본문과 댓글
`88fa293a-616e-47d5-81fa-ede269ce3c3a`는 정혜주가 2026-09-03 다음 계약을 승인했다고 기록한다.

1. 주간 사용률은 첫 관련 Profile 목록 조회에 성공한 distinct Account / WAA다.
2. Session은 TagChip의 특정 Hashtag 탐색 진입부터 이탈까지이며 다른 Hashtag 진입은 새 session이다.
3. 결과 선택률은 결과가 하나 이상 노출된 session 가운데 Profile을 하나 이상 선택한 session의 비율이다.
4. 한 session의 여러 선택은 최대 한 번만 세고 cache·network 재노출은 중복 집계하지 않는다.
5. 주간 사용률·결과 선택률·Empty·Error 비율을 완료된 주 단위로 검토한다.

PROD-556 본문에는 production Web, Asia/Seoul 월요일 주차, WAA·제외 규칙, 재시도 성공 우선,
Account 전환, 주 경계를 넘는 선택 귀속, 분모 0과 개인정보 경계도 명시돼 있다.
화면 진입만으로 세던 댓글 `507141ff-5d28-4e01-bdcb-0e07e6eb21bc`의 공식은 Superseded다.

## 이번 세션과의 구분

이전 spec 검증 댓글 `02218ab3-04b6-4859-b7c9-d7086c37ba19`는 작성·윤문·검증 완료와 최종 승인 대기를
기록한다. 현재 파일은 당시 digest와 동일한 원문이라고 주장하지 않으며, 이번 검증 결과는 새 handoff에 남긴다.
제품 계약 승인을 구현·배포 승인이나 현재 산출물의 최종 승인으로 확대하지 않는다.

2026-09-21 병합된 PR #955는 Product Analytics만 활성화하고 Replay를 비활성화했다.
PROD-741의 2026-09-22 결정은 정책·운영 조건 충족 뒤 재활성화·검증을 그 이슈가 맡도록 한다.
이 변화는 위 지표 계산식을 바꾸지 않는다.
