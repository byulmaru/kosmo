## Current Constraints

이 문서는 현재 구현에 맞춘 작업 메모다. 접근 방식은 같은 계약 안에서 바꿀 수 있다.
기준 commit은 `e7b25e151f9baf665b9bab90d725ba2ffd0f0b81`이다.

- `apps/app/src/components/post/PostListItem.tsx`의 순수 Repost 분기는 attribution 뒤 `PostListRow`에 B를 전달한다. Row는 B 본문 다음에 바로 Action Surface를 표시해 C가 누락된다.
- `PostListRow_post`는 C를 직접 소비하지 않는다. B의 `quoteSurface`에 포함된 `ReplyComposerSurface_parent`는 이미 `repostSource`를 조회하므로 operation에 데이터가 있어도 fragment masking 때문에 Row에서 직접 읽어 표시할 수 없다.
- `apps/app/src/components/post/PostSourcePresentationView.tsx`의 `PostSourcePreview_source`는 Author·생성 시각·Content를 소유하며 그 아래 `repostSource`를 선택하지 않는다.
- `apps/app/src/app/(tabs)/(post)/[profileHandle]/[postId].tsx`는 contentless Repost ID를 direct Source로 `router.replace`한다. `PostLayout.tsx`는 기존 Quote 상세의 preview를 표시한다.
- `PostReplySurface.tsx`의 Reply binding은 A, `PostActionSurface.tsx`의 social action·Reaction Summary target은 B다.

## Practical Approach

1. `PostListRow_post`에 `repostSource { ...PostSourcePreview_source }`를 colocate하고, B 본문 뒤와 Action Surface 앞에 nullable `PostSourcePreview`를 조합한다. 기존 바깥 card와 B의 표준 행을 유지한다.
2. preview가 소유한 navigation·Content Warning·Media 표현을 재사용한다. 추가 Source 조회나 전체 Post renderer 재귀를 만들 필요는 없다.
3. Relay 생성물을 갱신하고 Home·Profile 공용 renderer와 Bookmark 소비 fixture에서 실제 A→B→C 관계가 전달되는지 확인한다.
4. B action target, A Reply disabled, B/C/Author/외부 URL 이동과 A URL의 B 상세 replace redirect를 실행 결과로 확인한다. API·route는 회귀 증거가 부족한 부분에만 검증을 보강한다.

## Alternatives and Traps

- 전체 `PostSourcePresentationView`나 `PostListItem`을 C에 재귀 사용하면 article·Action Bar나 Source 깊이가 중복될 수 있다. 기존 가벼운 `PostSourcePreview`를 우선 사용한다.
- B의 C 데이터를 부모가 flatten하거나 별도로 재조회하면 direct Source identity와 nullable 정책의 경계를 흐릴 수 있다.
- `ProductionRepostQuoteListIntegration`은 현재 B 본문과 Action Bar 사이 거리를 검사한다. preview 추가 뒤에는 실제 마지막 표시 영역과 Action Bar 사이의 기존 간격을 확인한다.
- Bookmark의 `RepostQuoteUsesOneSourceDepth`라는 이름만으로 Repost-of-Quote 검증을 단정하지 않는다. 현재 fixture의 Repost Source에 Quote 관계가 없으므로 실제 A→B→C를 구성해 확인한다. 새 Bookmark 후보·저장 정책은 추가하지 않는다.
- `PureRepostDetailCanonicalizesToSource`는 현재 일반 Source를 사용한다. Quote B로 replace한 뒤 C preview와 B의 Reply 상태를 관찰하고, pathname뿐 아니라 뒤로 가기 동작도 검증한다.
- 일반 `QuoteOfQuote`는 기존 한 단계 cutoff를 유지한다. Quote·Reply+Quote 목록·상세·thread에 표시 깊이를 전파하지 않는다.

## Risks / Limits

- C의 Content Warning·Media·긴 Content는 행 높이와 focus 흐름에 영향을 줄 수 있다. Web Light·Dark, 대표 좁은/넓은 viewport에서 확인한다.
- B/C nullable은 각 단계의 기존 Eligibility 결과를 소비한다. 원격 Quote의 승인·철회·resolution은 PROD-792 소유다.
- DB migration·backfill·공개 API 변경은 현재 계획에 없다. 구현 중 새로운 계약 변경이 필요하다는 근거가 나오면 사용자 결정 경계에서 멈춘다.
- 통상 UI 배포를 사용하고 문제가 생기면 표시·fragment 변경을 되돌린다. 저장 관계와 mutation target 변경은 계획하지 않는다.
- Native touch·VoiceOver·TalkBack 실제 관찰은 Native 출시 gate로 남긴다. Web 통과를 Native 검증으로 기록하지 않는다.
- 이 Spec 세션은 코드·fixture를 읽었으며 제품 runtime을 실행하지 않았다.

## Open Questions

새 제품·보안·rollout 결정은 없다. 최신 canonical·Linear가 이미 정한 범위를 구현 세션에서 재확인한다.
