## Session Context

PROD-836·PROD-681 및 canonical 공개 방문자 정책을 구현 세션에 전달하는 작업 메모다. 이 파일은 권위나 별도 승인 기록이 아니다.

## Choice Notes

### 공개 방문자 안내와 복귀

- Date: 2026-10-14
- Upstream context: 사용자 Question 답변 네 건, `docs/domain/policies/public-content-onboarding.md`, `docs/design/public-content-onboarding.md`, PROD-836·PROD-681.
- Choice: 안내 배치는 2026-10-16 선택으로 대체한다. 현재 탭의 닫힘 유지, 보호 메뉴 숨김, Profile 준비 뒤 원래 콘텐츠 복귀. 참여 action은 다시 누른다.
- Reason: 공개 읽기를 유지하며 인증과 참여의 차이를 설명한다.
- Alternatives: 모든 폭에서 중복 CTA, 닫기 없는 안내, 항상 홈 이동, 보호 메뉴 유지·비활성화.
- Consequences: 셸 표현뿐 아니라 Web 인증 callback과 Profile 준비 이후 연결을 함께 검증한다.

### 사이드바 버튼과 하단 패널

- Date: 2026-10-16
- Upstream context: 현재 사용자 지시, canonical 공개 방문자 정책과 design 문서.
- Choice: 좌측 `가입하기`·`로그인` 두 버튼 유지. Tumblr 하단 패널을 참고해 `KOSMO에서 계속하기` 아래에 `팀 별마루 소개`·`개인정보처리방침`을 배치한다. `가입하기`는 KOSMO 홈(`/`), `로그인`은 `/login`이다. 하단 `KOSMO에서 계속하기`도 홈(`/`)을 연다. 팀 소개는 `https://byulmaru.co/about-us`다. 모든 Web 폭에 하단 CTA를 표시하고 full 우측 레일에는 중복 가입하기·로그인 버튼과 별도의 가입·소개 안내 카드를 표시하지 않는다. 기존 레일 폭과 개인정보처리방침 링크는 유지한다. 두 보조 링크 사이에는 `·` 구분자를 넣지 않는다. 비로그인 mobile Web 헤더는 왼쪽 햄버거 버튼과 제목을 사용하며 별도의 뒤로가기나 오른쪽 메뉴 버튼은 추가하지 않는다. Native 앱에는 비로그인 공개 헤더나 이를 위한 뒤로가기 버튼을 새로 만들지 않는다.
- Reason: 안내를 닫아도 기본 인증 진입을 남기고 하단 패널에서 서비스 참여와 팀·정책 정보를 함께 찾게 한다.
- Alternatives: 헤더 우측 로그인 버튼은 제안이었으며 사용자 선택으로 확정되지 않았다.
- Consequences: 기존 닫힘·공개 조회·Profile 준비 후 복귀 계약은 유지한다. 사용자가 우측 안내 카드를 제외한 구성을 최종 스펙으로 확정하고 다음 구현 세션 인계를 요청했다.

## Unresolved Questions

- 없음.
