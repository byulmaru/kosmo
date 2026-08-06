# KOSMO 디자인 문서

KOSMO의 UI/프로덕트 디자인 결정을 기록하고 공유하는 문서 모음이다. 디자인 관련 코드 변경이나 Figma 작업을 하기 전에 이 문서들을 먼저 확인한다.

## 문서 목록

- [figma.md](./figma.md) — Figma 파일 구조와 작업 규칙
- [accessibility.md](./accessibility.md) — Web·Android·iOS 접근성 목표, target과 검증 기준
- [colors.md](./colors.md) — 컬러 토큰 정책
- [logo.md](./logo.md) — 확정 로고 자산, clear space와 플랫폼별 소비처
- [page-header.md](./page-header.md) — 주요 화면 공용 헤더의 variant, 높이와 소유권
- [settings.md](./settings.md) — 인증 설정 route, Account/Profile 정보 구조와 공통 상태 계약
- [feedback.md](./feedback.md) — Web 피드백 page의 정보 위계와 후속 popup 재사용 경계
- [typography.md](./typography.md) — 폰트 사용 규칙
- [breakpoints.md](./breakpoints.md) — 레이아웃 브레이크포인트 단계와 컨벤션
- [post-action-bar.md](./post-action-bar.md) — Post Action Bar의 28px geometry, 배치, Repost 메뉴와 오류 toast 계약
- [post-media-gallery.md](./post-media-gallery.md) — Post 첨부 이미지 1~4장의 surface, Sensitive·오류·상호작 경계
- [post-media-viewer.md](./post-media-viewer.md) — 선택한 Post 이미지의 modal 탐색, 원문 panel과 Action Bar 배치 계약
- [reply-composer.md](./reply-composer.md) — 목록 modal·좁은 화면 전체 작성기·상세 inline Reply Composer 계약
- [post-thread.md](./post-thread.md) — Post 상세 thread의 renderer·connector·row boundary 소유권과 geometry
- [media-upload-errors.md](./media-upload-errors.md) — Post Composer·Profile 편집의 공통 이미지 업로드 오류 분류와 복구 안내
- [reactions.md](./reactions.md) — Reaction Quick Picker, 요약 token toggle과 Profile 목록의 형태·상태·대상 Post 계약
- [profile-edit.md](./profile-edit.md) — Local Profile 편집 화면의 필드, 상태와 route 연결 경계
- [profile-tags.md](./profile-tags.md) — Profile Tag 편집·공개 표시의 플랫폼 공통 계약
- [hashtag-related-profiles.md](./hashtag-related-profiles.md) — Hashtag 관련 Profile 목록 탐색의 결과·상태 계약

## 갱신 규칙

- 디자인 결정이 바뀌면 그 변경을 담는 PR에서 관련 문서도 함께 갱신한다.
- 문서는 결정 이력이 아니라 "현재 유효한 결정"을 담는다. 과거 결정이 궁금하면 git 히스토리를 본다.
- 시점에 따라 달라지는 진행 현황은 최소한으로 적고, 적어야 할 때는 기준 날짜를 명시한다.
