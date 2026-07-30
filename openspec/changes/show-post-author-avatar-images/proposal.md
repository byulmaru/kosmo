## Why

저장된 Profile avatar가 공개 조회에 제공되어도 게시글 목록과 상세의 작성자 영역은 이미지 URL을 조회하지 않아 항상 이니셜 fallback만 표시한다. PROD-492가 제공하는 Profile avatar 공개 표현과 기존 공용 Avatar의 이미지 렌더링을 게시글 presentation에 연결해 실제 작성자 이미지를 일관되게 표시해야 한다.

## What Changes

- 홈·프로필·북마크 목록과 게시글 상세에서 작성자 Profile의 Ready avatar URL이 있으면 실제 이미지를 표시한다.
- 일반 Post, 순수 Repost의 direct Source, Quote의 직접 작성자와 direct Source가 각자 자신의 avatar를 표시한다.
- avatar 관계 또는 공개 URL이 없으면 현재 표시 이름·핸들 기반 이니셜 fallback을 유지한다.
- 기존 작성자 Profile 이동, 접근성 이름, 목록 48px·상세 및 Source preview 40px 크기와 레이아웃을 유지한다.
- 삭제된 `PostAuthorProfile` 재사용을 요구하는 오래된 active spec 문구를 PROD-588의 leaf consumer·공용 `Avatar` 계약에 맞춘다.
- 게시글 leaf Relay fragment와 가장 가까운 Storybook 검증만 확장하며 avatar 업로드·저장·공개 정책, 공용 Avatar 재설계와 비게시글 소비자는 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`; 적용되는 별도 `docs/design` 변경 없음
- Linear Contract: [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Linear Implementations: PROD-588; Profile avatar 공개 표현 제공 의존성 [PROD-492](https://linear.app/byulmaru/issue/PROD-492)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-post`: 게시글 목록·상세와 direct Source 작성자가 Ready avatar 이미지를 우선 표시하고 이미지가 없을 때만 이니셜 fallback을 표시한다.
- `web-app-shell`: 공용 `PostListItem`과 `PostLayout` 소비 화면에서 작성자별 avatar 이미지·fallback·기존 크기와 이동 계약을 일관되게 적용한다.

## Impact

- `apps/app`의 게시글 Relay fragment, `PostListItem`, `PostLayout`, `PostSourcePresentationView`와 기존 Posts Storybook 검증이 영향을 받는다.
- PR #435의 `Profile.avatar { id url }`와 `Avatar.imageUri`를 선행 입력으로 사용한다.
- PROD-588 자체에서 GraphQL schema, API resolver, DB migration, Media 공개 정책, 새 dependency는 변경하지 않는다.
- PROD-596이 소유하는 기본 avatar asset과 네트워크 이미지 로드 실패 정책은 제외한다.
