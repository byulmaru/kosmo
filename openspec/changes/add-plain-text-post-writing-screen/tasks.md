## 1. GraphQL 흐름

- [ ] 1.1 `/compose/+page.svelte`에 현재 세션과 선택 프로필을 조회하는 GraphQL query를 colocate한다.
- [ ] 1.2 새 글 작성 컴포넌트에 선택 프로필 fragment와 `createPost` mutation을 colocate한다.
- [ ] 1.3 TipTap editor의 `doc` JSON과 사용자가 선택한 공개 범위를 mutation 입력에 연결한다.

## 2. 작성 화면 상태

- [ ] 2.1 TipTap editor, 공개 범위 selector, 남은 글자 수 indicator, 게시 버튼을 포함한 새 글 작성 컴포넌트를 구현한다.
- [ ] 2.2 `kosmo-old`를 참고해 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 공개 범위 selector와 라벨/설명을 구현한다.
- [ ] 2.3 공개 범위 기본값을 `UNLISTED`로 두고, 사용자가 선택한 값을 `createPost` mutation 입력에 연결한다.
- [ ] 2.4 인증 없음, 세션 로딩, 선택 프로필 없음 상태를 화면에서 구분하고 선택 프로필이 없으면 작성 컴포넌트를 렌더링하지 않는다.
- [ ] 2.5 trim 기준 빈 본문과 500자 초과 본문에서 게시 버튼을 비활성화하고 mutation 호출을 막는다.
- [ ] 2.6 mutation 제출 중 상태를 표시하고 중복 제출을 방지한다.
- [ ] 2.7 mutation 실패를 작성 실패 메시지로 표시하고 사용자가 본문을 유지한 채 다시 제출할 수 있게 한다.
- [ ] 2.8 mutation 성공 후 별도 완료 패널이나 경로 이동 없이 editor 본문과 공개 범위를 기본값으로 초기화한다.
- [ ] 2.9 선택 프로필 표시는 최신 main의 `PostAuthorProfile` fragment spread로 재사용한다.

## 3. 검증

- [ ] 3.1 Mearie/Svelte 타입 생성 또는 동기화가 필요한 경우 실행해 GraphQL operation 타입을 최신화한다.
- [ ] 3.2 `pnpm --filter @kosmo/web check`로 Svelte 타입 검증을 통과시킨다.
- [ ] 3.3 로컬 웹 앱에서 `/compose` 화면의 공개 범위 선택, 로딩, 선택 프로필 없음, 빈 본문/500자 초과 버튼 비활성화, 성공 초기화, 실패 상태가 레이아웃 깨짐 없이 표시되는지 확인한다.
