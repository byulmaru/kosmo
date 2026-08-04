## Why

Web Post Composer는 갤러리에서 고른 이미지를 기존 Media 업로드 lifecycle로 첨부할 수 있지만, 클립보드의 이미지 byte는 같은 흐름에 넣을 수 없다. PROD-639는 Composer에 focus한 Web 사용자가 붙여넣기만으로 이미지를 첨부하고 picker 이미지와 동일한 상태·복구·제출 계약을 사용하게 한다.

## What Changes

- Web Composer의 본문 입력에서 clipboard `paste`를 관찰하고 지원 가능한 image item을 현재 남은 Media 슬롯 순서대로 받는다.
- 붙여넣은 이미지를 기존 `issueMediaUploadUrl` → 제한 URL `PUT` → `completeMediaUpload` lifecycle과 preview·실패·재시도·제거·제출 상태에 연결한다.
- 이미지가 없는 clipboard payload는 browser의 기본 Plain Text·링크 붙여넣기를 그대로 유지한다.
- picker와 paste로 추가한 Media를 하나의 최대 4개 목록에서 추가 순서대로 관리하고 같은 오류·제출 계약을 적용한다.
- 이미지와 일반 텍스트가 함께 있는 clipboard payload의 결과는 PROD-639에 현재 권위가 없으므로 upstream 결정 전까지 구현 근거에서 제외한다.
- Android·iOS clipboard 접근, 새 변환·압축·HEIC 지원, Reply 이미지 버그 수정과 clipboard HTML rich-text 변환은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/design/accessibility.md`
- Linear Contract: [PROD-639](https://linear.app/byulmaru/issue/PROD-639/post-composer%EC%97%90%EC%84%9C-%ED%81%B4%EB%A6%BD%EB%B3%B4%EB%93%9C-%EC%9D%B4%EB%AF%B8%EC%A7%80-%EB%B6%99%EC%97%AC%EB%84%A3%EA%B8%B0%EB%A5%BC-%EC%A7%80%EC%9B%90%ED%95%9C%EB%8B%A4)
- Linear Implementations: PROD-639가 계약·구현·Web 검증 책임을 함께 소유한다.
- Existing Baseline: [PROD-553](https://linear.app/byulmaru/issue/PROD-553/post-composer%EC%97%90%EC%84%9C-%EC%9D%B4%EB%AF%B8%EC%A7%80%EB%A5%BC-%EC%84%A0%ED%83%9D%EC%97%85%EB%A1%9C%EB%93%9C%EC%B2%A8%EB%B6%80%ED%95%9C%EB%8B%A4), active `post-composer-media-upload` spec

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post-composer-media-upload`: Web Composer의 이미지 입력 source에 clipboard paste를 추가하고 picker와 동일한 업로드·항목 상태·제출 계약을 적용한다.

## Impact

- `apps/app/src/components/post/PostComposer.tsx`: Web 본문 입력의 paste event와 기본 텍스트 입력 경계
- `apps/app/src/components/post/PostComposerMediaControls.tsx` 및 `postComposerMedia.ts`: picker·clipboard 공용 Media item 추가와 preview lifecycle
- `apps/app/src/stories/Posts.stories.tsx`: clipboard item, 슬롯, 실패·재시도·제거와 텍스트 회귀 component 검증
- `apps/web/e2e/compose.e2e.ts`: 실제 Web paste event와 기존 create flow 회귀 검증
- GraphQL schema, Media Storage Service 계약, dependency와 Native surface 변경 없음
