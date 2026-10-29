## Session Work

- [x] 신규 프로필 생성 기본값과 온보딩 초기 선택을 `PUBLIC`으로 맞추고 관련 정책·디자인 문서를 갱신했다.
- [x] API integration·온보딩 state/route·Web E2E 테스트를 추가하고 GitHub CI에서 생성·저장·생략·바로 시작과 기존 공개 범위 경계의 회귀 검증을 통과했다.
- [x] 독립 리뷰와 코드오너 리뷰를 확인하고, 완료 전 상태로 남아 있던 세션 메모를 정리했다.

## Verification Evidence

- 구현 커밋 `42308d7b538979ba55dec1520bd2b0c65c5a07da`의 GitHub check 16개가 모두 성공했다.
- [Test](https://github.com/byulmaru/kosmo/actions/runs/40102144187)의 API·App·Web E2E 3개 shard와 전체 matrix, [Lint](https://github.com/byulmaru/kosmo/actions/runs/40102144172), [Semgrep](https://github.com/byulmaru/kosmo/actions/runs/40102144162)가 통과했다.
- 실제 API·앱 로그에서 첫·추가 생성, 온보딩 기본 저장과 미저장 선택의 생략·바로 시작 테스트 성공을 확인했다.
- [robin-maki의 승인](https://github.com/byulmaru/kosmo/pull/1286#pullrequestreview-5638660251)은 OpenSpec 정리를 요청했다. 별도 컨텍스트의 동작·보안 검토와 테스트·회귀 검토에는 조치할 finding이 없었다.
- 로컬 제품 테스트, iOS·Android·물리 기기 runtime, 실제 배포와 운영 데이터는 검증하지 않았다. 이를 완료한 task로 기록하지 않는다.
- 기존 nullable column을 유지하며 schema 변경·SQL migration·backfill은 없다.

## Progress

- Status: Archived
- 제품 요구사항은 canonical·Linear가 소유한다. 이 세션 하네스는 저장 정리를 위해 `--skip-specs`로 아카이브하며 별도 OpenSpec 계약을 추가하지 않는다.
- 이 정리는 OpenSpec 파일만 변경한다. 정리 커밋의 CI와 병합 결과는 [PR #1286](https://github.com/byulmaru/kosmo/pull/1286)에서 확인한다.
- Last updated: 2026-10-25
