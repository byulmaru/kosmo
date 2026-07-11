# PROD-265 E2E 커버리지 감사

## 범위

이 문서는 현재 저장소의 `apps/web/e2e/*.e2e.ts`, 구현된 웹 라우트, OpenSpec 요구사항을 대조해
E2E 테스트가 빠진 사용자 흐름을 정리한다. 공용 테스트 DB를 reset하는 전체 E2E는 이 작업에서
실행하지 않았고, 파일/스펙 대조와 타입/문서 검증으로만 확인했다.

주요 근거 파일:

- `apps/web/e2e/auth-routes.e2e.ts`
- `apps/web/e2e/timelines.e2e.ts`
- `apps/web/e2e/search.e2e.ts`
- `apps/web/e2e/profile-switcher.e2e.ts`
- `openspec/specs/web-app-shell/spec.md`
- `openspec/specs/post/spec.md`
- `openspec/specs/profile/spec.md`
- `openspec/specs/image-upload/spec.md`

## 현재 E2E가 덮는 영역

| 영역 | 현재 테스트 | 커버리지 요약 |
| --- | --- | --- |
| 인증과 보호 라우트 | `auth-routes.e2e.ts` | 루트 온보딩, mock OIDC 로그인, 보호 라우트 guest redirect, invalid session redirect, 주요 보호 라우트 heading smoke |
| 홈/프로필 게시글 목록 | `timelines.e2e.ts` | 홈 타임라인 최신순/팔로우 필터, 프로필 게시글 목록, 빈 목록, 긴/빈 본문, 프로필 게시글 목록 오류/재시도 |
| 검색 | `search.e2e.ts` | 검색 전/입력 중/검색 후 단계, 최근 검색, 검색 탭 URL 상태, 사람 탭 handle 결과/없음/오류/재시도, 검색 지우기/뒤로가기 |
| 프로필 전환 캐시 | `profile-switcher.e2e.ts` | 프로필 생성/선택 후 `selectedProfile` 캐시 반영, `/compose`/프로필/홈의 active profile 의존 query 갱신 |

## E2E 누락 목록

### 1. 게시글 상세 라우트

현재 `PostDetailQuery` 또는 `/@{handle}/{postId}`를 직접 여는 E2E가 없다.

추가 후보:

- 홈/프로필 게시글 목록의 본문 또는 시간 링크를 누르면 `/@{handle}/{postId}` 상세로 이동한다.
- 상세 화면이 본문, 작성자, 작성 시각, 공개 범위를 표시하고 상위 `(tabs)` 셸을 유지한다.
- URL handle이 실제 작성자 handle과 다를 때 canonical URL로 `replaceState` 정규화된다.
- 없는 post ID, GraphQL 오류, 다시 시도, 뒤로 가기 컨트롤을 검증한다.
- `DELETED` 분기는 현재 API node loader가 활성 게시글만 반환해 실데이터로 도달하기 어렵다. 삭제 상태를
  별도로 노출하는 backend 변경 뒤 E2E로 승격한다.

### 2. 글쓰기 작성기

`profile-switcher.e2e.ts`의 helper가 `/compose`에서 글을 하나 작성하지만, 작성기 자체의 상태와 실패
흐름을 검증하지 않는다.

추가 후보:

- active profile이 없을 때 `/compose`가 홈으로 이동 CTA를 표시하고, CTA가 `/home`으로 이동한다.
- 공개 범위 드롭다운의 네 옵션과 기본값 `UNLISTED`, 선택 후 버튼 라벨/아이콘 변경을 검증한다.
- 빈 본문, 공백 본문, 500자 초과 본문은 제출 버튼이 비활성화되고 mutation을 호출하지 않는다.
- 유효한 본문 제출은 `PostComposerCreatePost`를 호출하고 editor, 오류, 공개 범위를 기본값으로 초기화한다.
- mutation 실패 시 본문을 유지하고 오류를 표시하며 재제출할 수 있다.

### 3. 공개 범위와 관계별 게시글 노출

현재 게시글 목록 E2E는 사실상 `PUBLIC` 게시글만 다룬다. OpenSpec은 `UNLISTED`, `FOLLOWERS`,
`DIRECT` 공개 범위와 viewer 관계별 노출 차이를 요구한다.

추가 후보:

- 홈 타임라인은 followee의 `PUBLIC`/`UNLISTED`/`FOLLOWERS`를 포함하고 `DIRECT`를 제외한다.
- 프로필 게시글 목록은 guest/비팔로워에게 `PUBLIC`/`UNLISTED`만 보여주고, follower에게
  `FOLLOWERS`까지 보여준다.
- 작성자 본인은 자기 프로필 목록에서 모든 활성 공개 범위를 본다.
- 게시글 상세는 guest, 작성자, follower, 비팔로워 조합에서 접근 가능한 게시글만 표시한다.

### 4. 팔로우/언팔로우 사용자 흐름

`FollowButton.viewerState.test.ts`는 컴포넌트 경계만 확인한다. 실제 브라우저에서
`followProfile`/`unfollowProfile` mutation, 버튼 상태, 카운트 갱신을 검증하는 E2E가 없다.

추가 후보:

- 다른 프로필 페이지에서 팔로우 버튼을 누르면 버튼이 `팔로잉`으로 바뀌고 팔로워 수가 증가한다.
- 다시 누르면 언팔로우되고 버튼/카운트가 원복된다.
- 검색 사람 탭 결과의 팔로우 액션도 동일하게 동작한다.
- 자기 프로필에서는 팔로우 버튼이 숨겨진다.
- mutation 실패 시 오류 문구를 표시하고 기존 상태를 유지한다.

### 5. 팔로워/팔로잉 목록과 페이지네이션

`ProfileConnectionList`와 페이지네이션 helper는 단위 테스트만 있다. `/@{handle}/followers`,
`/@{handle}/following` 라우트를 실제 데이터로 여는 E2E는 없다.

추가 후보:

- 프로필 헤더의 팔로잉/팔로워 카운트 링크가 각각 목록 라우트로 이동한다.
- 직접 접근한 followers/following 라우트가 `ProfileHero`와 `(tabs)` 셸을 유지한다.
- 첫 페이지 목록 row가 올바른 프로필로 렌더되고 프로필 링크로 이동할 수 있다.
- 빈 목록, 첫 페이지 오류/재시도, `더 불러오기`, 다음 페이지 오류/재시도를 검증한다.
- 모바일 drawer 내부 사이드바 카운트 링크를 누르면 목록 라우트로 이동하면서 drawer가 닫힌다.

### 6. 프로필 페이지 상태와 프로필 헤더 세부 동작

프로필 게시글 목록의 정상/빈/오류는 일부 검증하지만, 프로필 layout 자체의 상태와 헤더 동작 E2E는
부족하다.

추가 후보:

- guest가 공개 프로필을 열어도 보호 라우트로 리다이렉트되지 않는다.
- 존재하지 않는 handle은 "프로필을 찾을 수 없어요" 상태를 보여준다.
- `ProfileLayoutQuery` 오류는 오류 상태와 다시 시도를 제공한다.
- bio, compact count, `팔로잉 -> 팔로워` 순서와 링크 click target을 검증한다.
- 긴 표시 이름/handle이 레이아웃을 깨뜨리지 않는지 대표 viewport에서 확인한다.

### 7. 반응형 앱 셸과 내비게이션

보호 라우트 heading smoke는 있지만 viewport별 앱 셸 계약은 E2E가 없다.

추가 후보:

- 데스크톱 폭에서 좌측 사이드바, 중앙 콘텐츠, 우측 레일 자리의 3컬럼이 렌더된다.
- 모바일 폭에서 하단 탭과 drawer trigger가 보이고 데스크톱 우측 레일은 보이지 않는다.
- 모바일 drawer는 버튼으로 열고, 메뉴 이동 후 닫힌다. swipe open은 Playwright에서 안정화 가능한
  방식이 정해지면 추가한다.
- 사이드바/하단 탭의 홈, 검색, 글쓰기, 프로필 항목 href와 active state를 검증한다.
- 선택 프로필이 없을 때 사이드바/하단 탭의 프로필 항목은 비활성화된다.

### 8. 홈 no-profile 온보딩 CTA

로그인 후 선택 프로필이 없을 때 온보딩 heading이 보이는지는 검증하지만, CTA가 기존 프로필 스위처
생성/선택 흐름을 여는지는 검증하지 않는다.

추가 후보:

- 프로필이 없는 사용자의 홈 온보딩 CTA가 프로필 스위처를 열고 새 프로필 생성 완료 후 홈 타임라인
  상태로 전환된다.
- 이미 접근 가능한 프로필이 있는 사용자의 CTA는 선택 흐름을 열고 선택 완료 후 온보딩을 숨긴다.
- 데스크톱과 모바일 drawer 경로를 분리해 검증한다.

### 9. OIDC callback edge case

현재 auth E2E는 허용되지 않은 `redirect_uri` 거부만 별도로 확인한다.

추가 후보:

- `code` 또는 `state`가 빠진 callback은 400을 반환하고 token 요청을 보내지 않는다.
- state cookie와 query state가 다르면 400을 반환하고 token 요청을 보내지 않는다.
- code verifier cookie가 없을 때 token 교환을 시도하지 않는다.
- token endpoint 실패는 오류 응답을 반환하고 session cookie를 만들지 않는다.
- 성공/실패 경로에서 login state/verifier cookie cleanup이 일관적인지 확인한다.

### 10. REST 이미지 업로드 endpoint

`apps/api/src/rest/upload.ts`와 OpenSpec `image-upload` 요구사항에 대응하는 E2E 또는 로컬 통합 테스트가
보이지 않는다.

추가 후보:

- 인증 session과 active profile이 있는 multipart `image` 업로드는 201과 media metadata를 반환한다.
- anonymous, active profile 없음, file field 누락, 허용되지 않은 MIME, 크기 초과 입력을 거부한다.
- R2 업로드 실패 시 502를 반환하고 local media/file row를 남기지 않는다.

### 11. 웹 GraphQL proxy 명시 검증

웹 E2E 전반이 `/graphql` proxy를 암묵적으로 사용하지만, proxy 계약 자체를 직접 검증하지 않는다.

추가 후보:

- `kosmo_session` cookie가 있으면 API 요청에 bearer token이 전달된다.
- cookie가 없으면 anonymous 요청으로 전달된다.
- API 응답 status, content-type, body가 웹 응답에 유지된다.

## 후속 작업 분할 제안

1. `post-detail.e2e.ts`: 게시글 목록 -> 상세 이동, 직접 접근, 오류/없음/뒤로가기.
2. `compose.e2e.ts`: 작성기 상태, 공개 범위, validation, 성공/실패.
3. `profile-connections.e2e.ts`: 팔로우/언팔로우, 팔로워/팔로잉 라우트, 페이지네이션.
4. `shell-responsive.e2e.ts`: desktop/mobile 셸과 내비게이션 active/disabled state.
5. `auth-callback.e2e.ts` 또는 기존 `auth-routes.e2e.ts` 확장: callback 실패 edge case.
6. API 업로드는 Playwright web E2E보다 API 로컬 통합 테스트로 먼저 고립하는 편이 빠르다.
