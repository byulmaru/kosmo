## Why

PostContent의 nullable Plain Text `summary`와 원격 Content Warning 저장·조회는 이미 존재하지만, Local
`createPost`는 값을 입력받지 않고 공용 Post UI도 경고가 있는 본문과 Media를 기본 가림하지 않는다. Local
Post·Reply 작성과 모든 공용 표시 surface가 같은 Content Warning 계약을 사용하도록 API와 UI를 함께 정렬해야
한다.

## What Changes

- Local `CreatePostInput`에 optional nullable `contentWarning`을 추가하고 기존
  `PostContentDocumentV1.summary` 저장·조회 경로에 연결한다.
- 일반 Post와 Reply Composer에 Plain Text Content Warning 입력, 본문과의 합산 500자 검증, 성공·실패·문맥
  전환 lifecycle을 추가한다.
- Reply Composer는 direct Parent의 Content Warning을 새 draft의 초기값으로 한 번 복사하고 이후 사용자가
  독립적으로 수정하거나 제거할 수 있게 한다.
- Content Warning이 있는 Post는 경고를 표시하고 본문과 Media를 기본 가림하며, canonical `Post.id` 기반 reveal
  상태를 같은 selected Profile·session lifecycle의 모든 surface에서 공유한다.
- Content Warning reveal과 Sensitive Media 공개 상태를 독립적으로 유지하고 별도 저장 모델·DB column·서버
  동기화 preference를 만들지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/objects/media.md`, `docs/design/reply-composer.md`, `docs/design/accessibility.md`
- Linear Contract: [PROD-460](https://linear.app/byulmaru/issue/PROD-460),
  [PROD-642](https://linear.app/byulmaru/issue/PROD-642)
- Linear Implementations: PROD-460 — Local GraphQL 입력·저장·성공 회귀 검증, PROD-642 — 일반·Reply Composer와
  공용 Content Warning 표시·reveal UI 및 검증

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: Local Post·Reply의 optional Content Warning 입력·canonical summary 저장, Composer 입력·합산 검증과
  canonical Post identity 기반 공용 reveal 계약을 추가한다.
- `post-reply-ui`: Parent Content Warning 초기값, Reply 문맥 보호 lifecycle과 Parent preview의 공용 reveal
  계약을 기존 Reply surface에 추가한다.

## Impact

- API GraphQL schema와 `createPost` resolver·통합 테스트가 영향을 받는다.
- App의 일반·Reply Composer, 공용 Post renderer, Media 가림 경계, selected Profile·session Provider와
  Relay fragments·Storybook 테스트가 영향을 받는다.
- `PostContentDocument` schema, DB schema·migration, ActivityPub ingestion/materialization 계약과 workspace
  dependency는 변경하지 않는다.
