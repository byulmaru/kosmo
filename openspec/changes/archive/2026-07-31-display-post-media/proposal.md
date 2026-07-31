## Why

Post Composer는 Ready Media가 첨부된 Post를 만들 수 있지만 공용 목록·상세 renderer는 현재 Media node를
표시하지 않는다. PROD-570이 권한 있는 viewer에게 현재 Post Content의 실제 Media 표시 정보를 제공하므로,
media-only와 text+media Post를 Web·iOS·Android에서 동일하고 접근 가능하게 읽을 수 있는 UI 계약이 필요하다.

## What Changes

- 일반 Post 목록과 상세가 현재 Post Content의 Media를 document 순서대로 최대 4개 표시한다.
- media-only와 text+media Post가 같은 공용 React Native renderer를 사용하고 기존 본문·안전한 링크 의미를
  보존한다.
- nullable Alt Text를 이미지의 접근 가능한 설명에 반영하고, 설명이 없을 때 장식 이미지로 잘못 숨기지 않는
  안전한 기본 이름을 제공한다.
- Sensitive Media는 기본적으로 가리고 사용자가 명시적으로 표시하거나 다시 가릴 수 있는 control을 제공한다.
- 이미지 로딩 실패는 해당 Media만 fallback으로 대체하며 같은 표시 URL을 다시 로드하는 재시도 action을
  제공한다.
- Storybook 상태와 Web keyboard, iOS·Android touch·screen reader 경로를 검증 가능한 공용 UI로 제공한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`,
  `docs/design/accessibility.md`, `memory/frontend-react-native.md`
- Linear Contract: PROD-571
- Linear Implementations: PROD-570

## Capabilities

### New Capabilities

- `post-media-display`: 현재 Post Content의 ordered Media를 목록·상세에서 접근 가능하고 오류에 안전하게
  표시하는 공용 UI 계약

### Modified Capabilities

없음.

## Impact

- `apps/app`의 Post Relay fragment, 공용 Post Content/Media renderer, theme style과 Storybook fixture·state가
  변경된다.
- PROD-570의 `PostContent.media`와 Media `url`, `mediaType`, `altText`, 그리고 canonical document root의
  `sensitiveMedia`를 사용한다.
- GraphQL backend 계약, Media Storage Service, Composer 업로드·작성, fullscreen viewer와 Remote Media는
  변경하지 않는다.
