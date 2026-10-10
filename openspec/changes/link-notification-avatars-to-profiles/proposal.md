## Why

반응·재게시 알림의 프로필 사진을 누르면 게시글로 이동한다. 사진이 가리키는 행위자의 프로필을 바로 열 수 있도록
PROD-1078의 개선 범위를 기록한다.

## Goal

사진은 해당 행위자 프로필로, 사진 외의 게시글 영역은 기존 대상 게시글로 한 번 이동한다.
각 활성화의 Best Effort Read는 한 번 시작하며 읽음 요청의 지연·실패가 이동을 막지 않는다.

## What Changes

- Reaction/Repost 사진과 게시글의 이동 영역을 분리한다.
- 여러 사진이 표시되면 사진마다 해당 프로필을 선택할 수 있게 한다.
- 사용자 선택에 따라 이 두 유형의 사진 겹침만 제거하고, 기존 사진 크기·최대 개수와 플랫폼별 입력 기준을 유지한다.
- 현재 목록과 공용 표시 컴포넌트의 이동·읽음·접근성을 함께 검증한다.

## Non-Goals

알림 집계·생성·Push, 서버 API·DB 변경, 다른 알림 유형의 이동 재설계, Figma·배포 변경은 포함하지 않는다.

## Constraints

- `docs/domain/objects/notification.md`의 Related Profile/Post 의미, 조회 권한과 멱등 읽음 처리를 유지한다.
- 기존 pending/disabled에서는 사진과 게시글 이동을 모두 차단한다.
- CW·sensitive 미리보기와 Read/Unread·hover 표시를 유지한다.
- 이번 Spec은 조사·문서 작성만 수행한다. 구현과 runtime 검증은 다음 phase의 책임이다.

## Verification

두 알림 유형 각각의 사진·게시글 목적지, 중복 이동·읽음 요청, 요청 지연·실패, 복수 사진·기본 사진,
keyboard focus와 Native touch·VoiceOver/TalkBack을 확인한다. Storybook·Web E2E와 Native 관찰 결과를 구분한다.

## Business Context

- Product canonical: `docs/domain/objects/notification.md`.
- Visual design source: `docs/design/notifications.md`, `docs/design/accessibility.md`.
- Linear: [PROD-1078](https://linear.app/byulmaru/issue/PROD-1078).
- User agreement: 2026-10-10 이번 Spec 대화에서 `반응·재게시만 겹침 제거 (권장)`를 선택했다.

## Session Status

- Status: Active
- Last updated: 2026-10-10
- 구현 전 계획이다. 이 하네스는 요구사항이나 구현 승인에 대한 별도의 권위가 아니다.
