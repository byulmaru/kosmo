## 문서 정렬 — 2026-10-04

- [x] 사용자 결정과 기존 태그 탐색·뮤트 계약을 확인한다.
- [x] ADR·도메인·디자인 문서에 태그 상세 페이지의 뮤트 진입점을 반영한다.
- [x] OpenSpec의 모호한 진입점과 오래된 완료·인계 상태를 바로잡는다.
- [x] Linear 본문과 완료 조건을 같은 흐름으로 갱신하고 다시 읽어 확인한다.
- [x] OpenSpec strict validation, Prettier, diff 검사를 수행한다.

## 승인된 구현·검증

2026-10-04 헤더 우측 종 아이콘 목업의 구현 승인을 받았다. 후속 사용자가 리뷰·문서·스펙 정합성 확인 후 PR 반영을 요청했다.

- [x] 프로필 화면의 태그 뮤트 벨·메뉴를 제거하고 기존 TagChip 링크와 Profile 자체 뮤트를 유지한다.
- [x] 기존 태그 상세·관련 Profile 목록 페이지에 서버 상태와 태그 뮤트·해제를 연결한다.
- [x] 기존 확인 UI, 취소, 중복 제출 방지, 오류·재시도, 현재 화면의 성공 상태 반영과 focus를 검증한다.
- [ ] Profile·Account·태그 전환 중 늦은 응답 격리와 다른 Scope·임시 규칙 보존을 검증한다.
- [ ] 실제 API로 Profile Tag → 상세 페이지 → 뮤트 → 상태 확인 → 해제 흐름을 검증한다.
- [ ] 직접 상세 진입의 동일 identity, selected Profile 없는 목록 탐색, 기존 pagination·오류 복구를 검증한다.
- [ ] 키보드·접근성·좁은 폭·긴 태그·Light/Dark를 검증하고 Storybook의 실제 상세 페이지 상태를 캡처한다.

## 원격 전달 전 검증 기록 — 2026-10-04

- 로컬 구현: 완료. 헤더 Bell/BellOff → 직접 확인창, 실제 Relay mutation·서버 상태 연결, ProfileHero의 태그 뮤트 제거.
- 통과: Relay compiler, 앱 TypeScript, 관련 단위 테스트 24개, Storybook interaction·a11y 13개,
  Storybook 정적 빌드, Expo Web export, 변경 코드 ESLint, 문서 Prettier·OpenSpec strict·diff 검사.
- Storybook은 실제 route·컴포넌트·Relay Store를 사용하고 응답만 fixture로 제공했다. 생성·해제·취소·focus,
  실패·재시도, pending 중 dismiss 금지, 임시 규칙 충돌, selected Profile 없는 탐색을 검증했다.
- 실제 API·DB E2E: 실행 준비 실패. 기존 54329 포트 충돌 후 별도 54339 포트·격리 DB로 재시도했으나
  `packages/core`에서 `tsx` 패키지를 찾지 못해 테스트 시작 전에 종료됐다. 만든 DB·컨테이너·네트워크는 정리했다.
- 아래 미완료 항목은 원격 전달 전 상태다. 최신 HEAD의 CI 결과와 남은 검증 범위는 PR #1095와 portable handoff에서 확인한다.
- 실제 API·DB E2E에 직접 상세 URL 재진입, 임시 복합 규칙의 Notification만 해제, Profile·태그 전환 후 늦은 응답 격리를 추가했다. 이 기록 시점에는 CI 실행 전이며 Native runtime은 현재 Web 출시 검증 범위 밖이다.
- 코드 리뷰와 복잡성 재검토: 최종 actionable finding 0. 충돌 버튼의 잘못된 dialog 안내와 로딩 표시 이름을 수정했다.
- 실제 구현 Storybook 캡처 완료. 이전 목업·프로필 화면 CI 결과를 현재의 실제 API·DB 검증 근거로 재사용하지 않는다.
- 후속 리뷰·전달: correctness·보안·테스트·복잡성과 문서·스펙 정합성을 재검토한다. 현재 HEAD의 GitHub CI 전체와 충돌 없음을 확인한 뒤 Ready로 전환한다. 원격 검증 결과는 PR과 portable handoff에 기록한다.
