# 2026-08-31 탐색 전환 정의 검토와 승인 기록

이 문서는 현재 정책의 권위가 아닌 이력 요약이다. 기존 임시 작업 폴더의 원문이 없어 2026-09-22에
[PROD-557](https://linear.app/byulmaru/issue/PROD-557) 본문과 승인 댓글
`ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`을 근거로 복원했다. 과거 원문을 그대로 복구한 문서는 아니다.
현재 계산 정책은 [Search Conversion Analytics Policy](../policies/search-conversion-analytics.md)를 따른다.

## 2026-08-31 범위 정리

PROD-520이 Canceled 상태이고 전환 정의의 승인 기록을 확인하지 못해, 탐색 전환 정의를 PROD-557에서
확정하도록 범위와 의존성을 정리했다. 전체 북극성 지표와 WAA는 이관하지 않았다.

## 2026-09-03 승인

같은 검색·대상별 journey 분모, 재선택·뒤로가기 중복 제거, 조회 또는 실제 Follow Relationship 성공의 합집합,
정확히 30분 포함, 주체·인증·PostHog session·새 검색·탭·reload 종료 경계, 시작일·Asia/Seoul 집계와 개인정보
제한이 승인됐다. Pending Follow Request와 이후 비동기 승인은 제외했다.

PROD-557이 계산 정의·계측·자체 검증을 소유하고 PROD-795의 공통 개인정보·운영 전환 선행 관계를 유지했다.
당시 승인에는 아직 작성하지 않은 OpenSpec의 최종 승인이나 구현·production acceptance가 포함되지 않았다.
현재 OpenSpec의 사용·정리 방식은 저장소의 `AGENTS.md`와 세션 하네스 정책을 따른다.
