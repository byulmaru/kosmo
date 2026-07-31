## Why

프로필 이미지 URL이 없는 사용자는 현재 표시 이름이나 핸들 기반 이니셜 아바타로 표시되어 KOSMO의 승인된
기본 아바타 디자인과 일치하지 않는다. 공용 Avatar primitive에 최종 에셋을 적용해 프로필·게시글·알림·검색
등 모든 소비 화면의 URL 부재 상태를 일관되게 만든다.

## What Changes

- 프로필 이미지 URL이 없을 때 표시 이름이나 핸들에서 만든 이니셜 대신 승인된 기본 아바타 이미지를 표시한다.
- 실제 프로필 이미지 URL이 있으면 기존 원격 이미지를 우선한다.
- 공용 Avatar primitive의 원형 clipping, 크기 조절과 프로필 이름 기반 접근 가능한 이름을 유지한다.
- 네트워크 이미지 로드 실패, 프로필 이미지 연결·업로드·삭제 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/figma.md`
- Linear Contract: [PROD-596](https://linear.app/byulmaru/issue/PROD-596/프로필-이미지가-없는-사용자를-위한-기본-아바타를-적용한다)
- Linear Implementations: PROD-596

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-post`: 게시글 작성자 프로필 이미지 URL 부재 fallback을 이니셜에서 승인된 기본 이미지로 변경한다.
- `web-app-shell`: 게시글 상세와 프로필 화면의 프로필 이미지 URL 부재 fallback을 이니셜에서 승인된 기본
  이미지로 변경한다.

## Impact

- `apps/app`의 공용 Avatar primitive, 정적 이미지 asset, 근접 Storybook 상태와 단위 테스트가 영향을 받는다.
- GraphQL schema, 프로필 이미지 URL 연결, API, 데이터베이스, migration과 새 dependency는 영향을 받지 않는다.
- 같은 Profile requirement를 수정 중인 active OpenSpec change와 archive할 때 최신 fallback 계약을 다시
  대조해야 한다.
