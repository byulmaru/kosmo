## Why

비로그인 첫 화면에는 시작하기 버튼만 있어 가입 전에 게시글과 대화를 둘러보기 어렵다. PROD-1199는 기존 로컬 타임라인과 공개 페이지 방문자 UI를 연결해 이 진입 경험을 바꾼다.

## Goal

비로그인 Web 방문자가 `/`에서 로컬 공개 게시글을 바로 읽고 작성자 프로필·게시글 상세로 탐색을 이어갈 수 있게 한다. 세 공개 화면의 방문자 안내에는 같은 긴 코스모 로고를 사용한다.

## What Changes

- 계정·선택 프로필 없이 로컬 타임라인의 첫 조회와 다음 페이지 조회를 제공하고, 기존 공개 프로필·게시글 셸의 중앙 콘텐츠 영역에 배치한다.
- `/`, `/@{handle}`, `/@{handle}/{postId}`가 방문자 UI를 공유한다. 사이드바·모바일 메뉴의 두 설명 문구를 긴 로고로 바꾼다.
- 공개 탐색 범위와 방문자 표현을 관련 정책·디자인 문서에 반영하고 API·화면·공개 탐색 경로를 검증한다.

## Non-Goals

Native 비로그인 화면 신설, 추천·랭킹 변경, 첫 프로필 온보딩 재설계, 인증 후 출발 콘텐츠 자동 복귀, 인증 전에 시도한 참여 행동의 자동 실행은 포함하지 않는다. 이 Spec 세션에서는 애플리케이션을 구현하거나 실행 테스트를 수행하지 않는다.

## Constraints

- PROD-649의 기존 로컬 후보·최신순 정렬·페이지네이션과 현재 Post Visibility·Post Eligibility·목록 제어를 유지한다. PUBLIC 일반 게시글·인용만 대상이며 비공개 범위나 기존 제외 후보를 새로 노출하지 않는다.
- 조회를 허용해도 참여 권한은 확대하지 않는다. 유효 Session과 선택 Profile 유무를 구분하고, 인증 사용자의 `/home` 이동과 Profile 준비 흐름을 유지한다.
- PROD-836의 직접 인증 진입과 하단 CTA·탭 단위 닫힘을 유지한다. full·compact·모바일 Web의 기존 폭·스크롤·메뉴 구성을 재사용하고 로고·가입·로그인의 접근성을 유지한다.
- 이 change는 PROD-1199와 canonical 문서를 요약한 임시 작업 메모다. 구현 방법은 바꿀 수 있으며 별도 제품 요구사항이나 승인 절차를 만들지 않는다.

## Verification

guest의 첫 조회·다음 페이지 조회와 후보 제외, 참여 권한 유지, 인용 원문 비가시성, 목록의 loading·empty·error·retry·refresh를 실행으로 확인한다. 세 route의 직접 진입·새로고침·상호 탐색, 공통 로고·인증 진입·CTA 닫힘·메뉴 접근성을 full·compact·모바일 Web에서 확인하고 인증 사용자·Profile 준비·기존 홈·로컬을 회귀 검증한다.

## Business Context

- Product canonical: `docs/domain/policies/public-content-onboarding.md`, `docs/domain/policies/post-list.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`.
- Visual design source: `docs/design/public-content-onboarding.md`, `docs/design/local-timeline.md`, `docs/design/accessibility.md`.
- Linear: [PROD-1199](https://linear.app/byulmaru/issue/PROD-1199). 완료된 [PROD-836](https://linear.app/byulmaru/issue/PROD-836)·[PROD-649](https://linear.app/byulmaru/issue/PROD-649)를 확장한다.
- User agreement: 현재 사용자가 PROD-1199의 `kosmo-spec-workflow`를 명시적으로 요청했다. 범위는 이슈 본문에 정해져 있다. 기존 canonical의 두 공개 화면·안내 문구 범위는 이슈의 명시적 변경에 맞춰 구현과 함께 갱신한다.

## Session Status

- Status: Active
- Last updated: 2026-10-22
