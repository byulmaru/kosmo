## Why

현재 Post Composer는 `DIRECT`(`언급한 계정만`)을 선택해 `createPost`에 제출할 수 있지만, Mentioned Profile recipient 입력·저장과 recipient 기반 조회 권한 계약이 아직 없어 사용자가 기대하는 접근 범위를 보장하지 못한다. PROD-462가 해당 계약을 완료하기 전까지 Composer의 선택 표면을 실제로 보장할 수 있는 공개 범위로 제한한다.

## What Changes

- Web·Native Post Composer의 공개 범위 메뉴에서 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 노출한다.
- `DIRECT` 옵션은 삭제하지 않고 주석 처리하며, `PROD-462`에서 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한이 구현되면 복원한다는 TODO를 남긴다.
- 기본 공개 범위 `UNLISTED`와 나머지 세 옵션의 선택·제출 동작은 유지한다.
- `PostVisibility.DIRECT` enum, 서버 visibility 코드, 기존 DIRECT 게시글의 저장·조회·표시 정책은 변경하지 않는다.
- Composer Storybook과 Web E2E에서 DIRECT 미노출 및 기존 공개 범위 선택을 검증한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md` (Post Visibility와 Post 작성 입력·조회 계약)
- Linear Contract: [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4) (2026-07-30 최신 계약; 복원 기준으로 PROD-462를 명시)
- Linear Implementations: `PROD-580` 구현 snapshot `bb3bc7e1f893891505559f7fb1ea119bec21a974` 및 연결 PR #429

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `post`: 기존 `Post visibility dropdown selection` requirement의 옵션 표시를 PROD-462 완료 전 임시 세 옵션 계약으로 수정한다.

## Impact

- Universal Composer의 Web·Native visibility option presentation과 해당 Storybook/E2E 검증만 영향을 받는다.
- `PostVisibility` enum, GraphQL input/schema, API/core 저장·조회 권한, 기존 DIRECT 데이터와 Mention/notification은 변경하지 않는다.
- 현재 구현 외 aggregate 검증에서 발견된 변경 범위 밖 실패(다른 route 타입 오류, PostActionBar `aria-modal` a11y 오류)는 이 change의 작업 대상이 아니다.
