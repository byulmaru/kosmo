## Context

현재 `PostListItem`, `PostLayout`과 `PostSourcePresentationView`는 작성자 표시 이름·핸들만 조회하고 공용 `Avatar`에 label만 전달한다. PR #435는 `Profile.avatar { id url }` 공개 projection과 `Avatar.imageUri`를 제공하지만 게시글 leaf fragment와 presentation mapping은 이를 소비하지 않는다. 이 change는 PR #435 exact head 위에 쌓이며 게시글 공용 React Native 경로만 변경한다.

## Goals / Non-Goals

**Goals:**

- 일반 Post, 순수 Repost direct Source, Quote의 직접 작성자와 direct Source가 각자의 Ready avatar 이미지를 표시하게 한다.
- 홈·프로필·북마크 목록과 상세 thread가 공유하는 leaf fragment 소유권을 유지한다.
- URL이 없을 때 현재 이니셜 fallback을 유지하고 기존 크기·레이아웃·이동·접근성 계약을 보존한다.
- 기존 Storybook과 Relay/typecheck 표면에서 변경 동작을 검증한다.

**Non-Goals:**

- Profile avatar 업로드·저장·공개 권한 또는 Media lifecycle 변경
- 공용 Avatar primitive, 기본 avatar asset, 이미지 로드 실패 fallback 정책 변경
- 비게시글 Avatar 소비자, Post 첨부 이미지 또는 새로운 디자인 변경
- 새 dependency, GraphQL schema, API resolver와 DB migration 추가

## Implementation Guidance

### Current Constraints

- `PostListRow_post`는 일반 목록 Post와 순수 Repost direct Source의 비재귀 표준 행을 함께 소유한다.
- Quote와 상세은 outer Profile과 direct Source Profile을 별도로 조회한 뒤 `PostSourcePresentationData` 또는 `SourcePostPresentationData`로 수동 mapping한다. 한쪽 Profile 값을 재사용하면 작성자 이미지가 뒤바뀐다.
- GraphQL 문서는 실제 소비 컴포넌트에 colocate하고 부모는 leaf fragment를 spread해야 한다. generated Relay artifact는 compiler 산출물이며 저장소에 commit하지 않는다.
- PR #435가 제공하는 `Avatar`는 URL 존재 여부만으로 이미지와 이니셜을 선택한다. 네트워크 이미지 로드 실패 시 별도 fallback으로 전환하는 계약은 없다.
- 기존 Posts Storybook은 production fragment shape와 Router decorator를 사용해 Repost·Quote의 작성자·Source 이동, avatar 크기와 presentation 구조를 검증한다.

### Recommended Approach

- 게시글을 실제로 렌더링하는 leaf fragment의 각 Profile selection에 `avatar { id url }`을 추가한다.
- outer 작성자와 direct Source 작성자의 avatar 값을 각자의 presentation data에 독립적으로 mapping한다.
- 기존 Avatar 호출에 해당 Profile의 nullable URL을 `imageUri`로 전달하고 label, size와 wrapper의 이동·접근성 속성은 유지한다.
- 기존 Storybook fixture에 서로 구분되는 작성자별 avatar URL과 null 상태를 추가하고, 일반 목록·Repost Source·Quote·상세에서 이미지 선택과 이니셜 fallback을 관찰 가능한 결과로 검증한다.
- Relay compiler, app typecheck와 Storybook 검증 뒤 실제 Web 공용 경로에서 목록·상세와 Source presentation을 확인한다.

### Allowed Alternatives

- 내부 presentation 타입은 nullable `avatar` 객체를 유지하거나 nullable `avatarUrl`로 평탄화할 수 있다. 어느 쪽이든 leaf fragment는 `id`와 `url`을 조회하고 작성자별 값을 섞지 않으며 공개 props를 불필요하게 확장하지 않아야 한다.
- 변경 동작을 직접 증명할 수 있는 기존 근접 unit test가 발견되면 Storybook assertion 일부를 그 테스트에 둘 수 있다. 새 fixture·helper·test harness는 추가하지 않는다.

### Known Traps

- `main`에는 필요한 Profile field와 image-capable Avatar가 없으므로 PR #435 의존성을 복제하거나 우회하지 않는다.
- route 또는 상위 query에 avatar scalar props를 수동으로 추가해 Relay fragment colocation을 우회하지 않는다.
- Quote outer 작성자, Repost 작성자와 direct Source 작성자의 avatar를 하나의 값으로 합치지 않는다.
- 이미지 표시를 이유로 48px·40px 크기, Profile Link, 접근성 label이나 layout spacing을 바꾸지 않는다.
- URL 부재 fallback을 네트워크 오류 fallback이나 PROD-596의 기본 asset 범위로 확대하지 않는다.

## Risks / Trade-offs

- [부모 PR #435 head가 rewrite되거나 먼저 병합됨] → exact parent SHA와 stack base를 확인하고, 변경 전 backup ref와 range-diff를 사용하는 stack 유지 절차로 새 부모에 정렬한다.
- [공개 또는 비로그인 Profile 조회에서 avatar projection이 예상과 다름] → 제품 코드 완료 주장 전 API/Web runtime에서 Ready avatar와 null avatar를 각각 관찰하고, 문제가 PR #435 계약에 있으면 PROD-588에 우회 구현하지 않는다.
- [Relay fixture가 실제 fragment shape와 어긋남] → compiler와 production fragment 기반 Storybook을 함께 실행해 schema·fixture 불일치를 검출한다.

## Migration Plan

DB 또는 데이터 migration은 없다. PR #435가 먼저 merge되도록 stacked PR base를 유지하고, 부모 merge 뒤 PROD-588 branch를 최신 `main` ancestry에 정렬한다. 배포는 앱 fragment와 presentation 변경만 포함하며 문제가 생기면 PROD-588 commit을 되돌려 기존 이니셜-only 표시로 복구할 수 있다.

## Open Questions

없음. 비로그인 공개 조회와 실제 이미지 로드 결과는 구현 선택이 아니라 완료 전 runtime 검증 항목으로 남긴다.
