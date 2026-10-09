## Session Context

이 문서는 PROD-986의 analytics delta를 구현 세션에 전달하기 위한 작업 메모다. 제품 범위의 근거는 [PROD-986](https://linear.app/byulmaru/issue/PROD-986)과 현재 사용자 지시이며, Reaction 기능 범위는 PROD-942의 선행 Stack이 소유한다.

## Choice Notes

### 선행 종류 식별에 맞춘 analytics key

- Date: 2026-09-27
- Upstream context: PROD-986의 안정적인 종류별 key 요구와 PROD-942 PR #1023의 정확한 Unicode 문자열 검증.
- Choice: 허용된 Reaction 문자열의 전체 코드 포인트를 순서대로 소문자 16진수로 표현하고 `unicode:` 영역을 붙이는 형식을 작업안으로 사용한다. 예: `❤️` → `unicode:2764-fe0f`.
- Reason: 선행 계약의 시퀀스 동일성을 보존하고 표시 이름·이미지·정렬 변경으로 key가 바뀌지 않는다.
- Alternatives: 별도 6종 enum, 표시 이름, 번역 조회용 표시 선택자 제거. 선행 범위를 줄이거나 서로 다른 Type을 합칠 수 있어 사용하지 않는다.
- Consequences: key는 반응 종류를 드러내는 분석 정보이며 익명화가 아니다. 선행 지원 집합과 key의 전수 대응을 검증해야 한다. 구체 형식은 analytics 구현 수단으로서 해당 이슈 범위에서 조정할 수 있다.

### 종류별 집계의 최소 범위

- Date: 2026-09-27
- Upstream context: PROD-986의 Account별 사용·빈도·반복 사용 요구, PROD-795의 Account identity, PROD-820의 `Asia/Seoul` 프로젝트 시간대. PROD-520은 Canceled이며 당시 댓글은 초안이다.
- Choice: 같은 `Asia/Seoul` 관측 기간의 식별된 production Web Account와 key 있는 `reaction_added`를 기준으로 distinct Account·추가 횟수·Account별 추가 횟수 분포를 따로 계산한다. 제거는 같은 기간의 `reaction_removed` 건수로 별도 표시한다. 내부·테스트 Account의 검증된 제외 목록이나 봇 분류 근거가 없으면 제외했다고 주장하지 않고 분석 결과에 미적용을 표시한다.
- Reason: 확정되지 않은 WAA·가입 분모와 추정 제외 규칙을 도입하지 않으면서 종류별 질문에 답한다.
- Alternatives: PROD-520 초안의 allowlist·봇 제외를 승인된 공통 계약으로 간주하거나 event 수 차이를 현재 반응 재고로 해석하는 방식은 채택하지 않는다.
- Consequences: 목록과 분류 근거를 확인하기 전에는 내부·테스트·자동화 사용이 지표에 포함될 수 있다. 이를 보고서에 명시한다.

## Unresolved Questions

- 없음. 선행 PR 변경과 실제 운영 제외 목록의 존재 여부는 구현 시 재검증할 자료이며 새 제품 범위 결정으로 간주하지 않는다.
