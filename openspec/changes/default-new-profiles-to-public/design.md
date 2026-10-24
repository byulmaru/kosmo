## Current Constraints

제품 범위는 PROD-1226과 canonical 문서를 따른다. 아래 내용은 구현 세션에서 조정할 수 있는 작업 메모다.
조사 기준은 main `502b5a6543eefc054952670af96e1da084dce407`이다.

- `apps/api/src/graphql/resolvers/profile/mutation/create.ts`는 새 Profile에 `UNLISTED`를 명시적으로 저장한다.
  첫 온보딩과 `apps/app/src/components/shell/ProfileSwitcher.tsx`의 추가 생성은 같은 mutation을 사용한다.
- `packages/core/db/tables.ts`의 `Profiles.defaultPostVisibility`는 nullable이며 DB 기본값이 없다.
  Remote Profile과 과거의 미저장 값까지 바꾸는 schema default나 backfill은 필요하지 않다.
- `apps/app/src/components/onboarding/firstProfileOnboardingState.ts`의 `initialFirstProfileDraft`도 `UNLISTED`다.
  생성 요청은 handle만 보내며, 게시 설정의 저장은 별도 `updateProfile` action이다.
- 온보딩 확인은 서버에 저장된 Profile을 요약한다. 게시 설정을 건너뛰거나 바로 시작하면 그 단계의 초안을
  저장하지 않는다. 클라이언트 초기값만 바꾸면 생략 경로에는 서버의 이전 기본값이 남는다.
- API의 `profile/field/private.ts`, 앱의 `profileDefaultPostVisibilityState.ts`와 `postComposerState.ts`는
  저장값 없음·조회 불가에 `UNLISTED`를 적용한다. 일반 Composer는 저장값을 사용하고 Reply는 Parent와 비교한다.

## Practical Approach

1. 생성 resolver의 명시적 값을 `PostVisibility.PUBLIC`으로 바꾼다. 기존 transaction·Owner Membership·생성 검증은 유지한다.
2. `initialFirstProfileDraft.defaultPostVisibility`를 `PUBLIC`으로 맞춘다. 초기 선택은 기존 ‘전체 공개’ 항목을 사용한다.
3. 저장·생략·바로 시작과 확인 요약의 기존 경계를 활용한다. 생성 시 이미 Public을 저장하므로 기본값을 위해
   추가 update나 skip 시 저장을 넣지 않는다. 사용자가 다른 범위를 저장한 경우에는 그 값을 따른다.
4. 실제 생성 결과를 검사하는 API integration과 온보딩 state·route·Web E2E의 기대값을 정렬한다.
   기존 Profile의 `UNLISTED`·`FOLLOWERS`·null, Remote Profile과 unavailable fixture는 원래 의미를 유지한다.
5. 기존 Composer 회귀에서 Public 저장값의 반영, 답글의 더 좁은 초기값과 열린 초안 보존을 확인한다.
   동작을 바꿀 필요가 없다면 Composer 구현을 수정하지 않는다.

## Alternatives and Traps

- 모든 `UNLISTED`를 `PUBLIC`으로 일괄 치환하면 조회 실패 처리와 과거 Profile의 공개 범위까지 넓어진다.
- DB default·migration·기존 row UPDATE나 새로운 공용 default helper는 현재 요구를 충족하는 데 필요하지 않다.
- UI 이름 ‘전체 공개’와 enum `PUBLIC`은 같은 선택지다. 이번 작업을 공개 범위 이름·설명 변경으로 넓히지 않는다.
- 생성 테스트 fixture와 기존 null·수동 Unlisted 선택 fixture를 구분한다. 기대 문자열만 바꾸거나 소스 문구를 검사해
  생성·저장 결과 검증을 대체하지 않는다.

## Risks / Limits

API와 클라이언트가 모두 변경된 조합에서 생성·생략·저장의 결과를 확인해야 한다. 구버전 API는 Unlisted를
생성하고, 구버전 앱은 Unlisted를 초기 선택한 뒤 명시적으로 저장할 수 있다. 서버에서 이 설정 저장을 강제로
Public으로 바꾸지 않는다. 배포된 API·앱 버전의 조합과 적용 시점은 이번 소스 조사로 확인하지 않았다.

코드 rollback은 이후 생성의 기본값에 영향을 주지만, 이미 저장된 Public 값을 되돌리는 데이터 변경을 포함하지 않는다.
현재 세션에서는 제품 테스트·CI·Web·iOS·Android runtime·운영 데이터 조회를 실행하지 않았다.

## Open Questions

미결정 제품 요구사항은 없다. 배포 상태와 플랫폼별 실행 결과는 구현·검증 이후 별도 증거로 남긴다.
