## Session Work

다음 구현 세션을 위한 변경 가능한 체크리스트다. 제품 구현은 아직 시작하지 않았다. 사용자가 확정한 사이드바·하단 안내·모바일 메뉴 구성을 반영했다.

- [x] 1.1 공개 Profile·Post에서 guest navigation의 `가입하기`·`로그인` 버튼을 각각 홈(`/`)·`/login`에 연결하고 모든 Web 폭에 하단 안내를 제공한다. full 우측 레일에는 중복 가입하기·로그인 버튼과 별도의 가입·소개 안내 카드를 표시하지 않는다.
- [x] 1.2 비로그인 mobile Web 공개 Profile·Post 헤더 왼쪽에 햄버거 메뉴 버튼을 제공하며 별도의 뒤로가기나 오른쪽 메뉴 버튼은 추가하지 않는다. 하단 `KOSMO에서 계속하기`를 홈(`/`)에 연결한다. 버튼 아래에는 `팀 별마루 소개`와 `개인정보처리방침` 링크를 `·` 구분자 없이 표시하고 탭 단위 닫힘과 비가림·접근성 상태를 구현한다.
- [x] 1.3 기존 OIDC 검증·Profile 초기화를 유지하며 홈(`/`) 경유를 포함한 안전한 공개 위치 복귀와 Profile 선택·생성 완료를 연결한다.
- [x] 1.4 두 공개 route, Web 세 폭, guest·valid/no Profile·valid/selected Profile과 session 오류를 행동 테스트로 검증한다.
- [x] 1.5 인증 취소·실패, 복귀 대상 위조·외부 URL·없는 콘텐츠, 선택·생성 실패와 자동 action 실행 없음, 취소·이탈·복귀 완료 뒤 일반 로그인에서 이전 복귀 대상이 재사용되지 않는지 검증한다.
- [x] 1.6 Web keyboard·focus·reflow·CTA 겹침, 모든 Web 폭에서 CTA 닫기 뒤 좌측 가입·로그인 접근, mobile 왼쪽 메뉴 열기와 drawer의 가입·로그인, 두 보조 링크의 주소를 실제 runtime에서 확인했다. 좁은 viewport로 reflow를 검증했고 실제 200% 브라우저 zoom은 직접 재현하지 않았다.

## Verification Evidence

- Result: 우측 `KOSMO에서 이야기를 이어가세요` 카드를 제외한 사용자 승인 구성을 구현했다.
- Checks: app unit 1005개, web unit 62개, app·web typecheck, ESLint, Prettier, Expo Web export, `git diff --check` 통과. Chromium 로컬 runtime에서 390×844 모바일 CTA·하단 탭 간격과 focus ring, 1024×900 compact 및 1440×900 full 중앙 열의 600px CTA 배치, 320×480 flow reflow·가로 overflow 없음, 탭 내 닫힘·키보드 drawer 접근·signup/login 주소를 확인했다. 로컬 GraphQL fixture는 guest Session과 공개 경로 응답만 제공했다.
- Limits: 실제 200% 브라우저 zoom은 직접 재현하지 않았다. 브라우저 runtime은 정적 Web export와 synthetic GraphQL fixture를 사용했으며 실제 OIDC 제공자, Native 기기, production 수용 증거가 아니다.

## Progress

- Status: Implementation complete
- Completed: 조사·설계, 최종 사용자 승인, scoped 구현·행동 검증.
- Next: Stack PR 전달과 review 상태 확인.
- Last updated: 2026-10-16
