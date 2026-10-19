## Current Constraints

- 기준 코드는 원격 main `faf76192af61b1e15919aeda3aa125804d9a4e0f`다. 현재 `Post`에는 Reply 수 field가 없고,
  Reply config를 만드는 목록·상세·compact Viewer의 세 경로 모두 count를 공급하지 않는다.
- `Posts.replyParentId`와 partial index는 이미 있다. 상세의 `replyDescendants`는 전체 하위 Reply의 페이지이며
  그 `edges.length`는 이번에 합의한 직접 Reply 수가 아니다.
- `PostActionBar`·`PostActionControl`·`formatPostActionCount`는 count 표시와 locale compact 포맷을 이미 지원한다.
- 제품 의미는 canonical·Linear와 현재 사용자 합의가 소유한다. 아래 API·파일·집계 방식은 구현 중 바꿀 수 있는 제안이다.

## Practical Approach

1. **집계와 API**: `apps/api/src/graphql/resolvers/post/field/`에 Post 소유의 수치 field를 추가하는 방향을 검토한다.
   `Post.replyCount` 정수 field를 우선안으로 두고, 여러 Parent ID를 요청 단위 loader에서 묶어 직접 Reply를
   grouped aggregate한다. 집계에 성공했지만 일치하는 row가 없을 때만 0을 반환한다. DB·권한 평가 실패를 catch하여 0으로
   반환하지 않는다. `apps/api/schema.graphql`을 함께 맞춘다.
2. **조회 정책**: `access/visibility.ts`와 `packages/core/visibility/post.ts`의 기존 직접 조회 조건을 시작점으로 삼는다.
   Repost 수의 viewer-independent 조건이나 목록 전용 필터를 그대로 복사하지 않는다. 특히 현재
   `postVisibilityAccessWhere`는 viewer가 차단한 상대도 제외하므로 canonical의 직접 조회 방향과 대조해야 한다.
   Followers Only의 멘션 수신자, Media 자격, Profile/Instance unavailable·Domain Block도 실제 실행 fixture로 확인한다.
   기존 helper에 누락이 있으면 이번 집계에 필요한 조회 조건을 공통 책임 안에서 최소한으로 보완한다. 기존 조회
   경로 전체의 정비로 범위를 넓히거나 count만의 약식 권한 규칙을 만들지 않는다.
3. **실제 화면**: `PostReplySurface.tsx`, `PostLayout.tsx`, `PostMediaViewerHost.tsx`의 Reply 소유 경계에서 field를
   읽어 기존 config에 공급한다. UI가 읽는 fragment를 갱신 응답에서도 재사용하는 작은 경계를 우선 검토한다.
   Parent query는 해당 fragment를 spread하며, Home·Local·Profile·Bookmarks와 상세/스레드·Viewer의 실제
   소비 경로를 모두 확인한다. pure Repost의 social target인 Source와 Reply identity를 섞지 않는다.
4. **작성·삭제 뒤 반영**: `PostComposerController.tsx`의 create 응답에서 새 Post의 `replyParent`를 통해 Parent의
   `id`와 수치 fragment를 선택하는 방식을 우선 검토한다. Reply에서 false일 수 있는 Home prepend 조건과
   Parent 수치 선택을 분리한다. 삭제는 `deletePost` 성공 payload가 조회 가능한 직접 Parent를 함께 제공하도록
   기존 삭제 결과와 `PostDeletionAction.tsx`를 최소한으로 확장하는 방안을 검토한다. 삭제된 Post의 Node를 다시 로드하거나
   모든 조상을 갱신할 필요는 없다.
5. **Relay**: 서버에서 확정한 Parent 수치를 요청 actor Environment의 normalized record에 반영한다.
   mutation 응답 fragment로 충분하면 별도 refetch를 추가하지 않는다. 필요한 경우에도 해당 Parent만 좁게
   재조회한다. 전역 Store reset·전체 타임라인 refetch·추측한 증감은 사용하지 않는다. 변경은 성공했지만 선택적
   수치 조회가 실패한 경우 0을 넣거나 작성·삭제를 다시 실행하지 않으며 기존 성공·오류 경계 안에서 처리한다.
6. **표시**: production Reply에는 1 이상일 때만 count를 공급한다. 공용 formatter의 0 지원과 Repost 동작은
   유지한다. 접근 가능한 label/value에서 표시 수치를 확인할 수 있도록 기존 Reply 상태와 함께 검증한다.

## Alternatives and Traps

- 영속 counter는 viewer별 조회 범위와 별도 정합성 처리가 필요하다. 기존 관계를 직접 집계하는 첫 구현의 비용을
  확인하기 전에는 저장 컬럼·backfill·Temporal 증감 workflow를 도입하지 않는다.
- 페이지의 Reply 개수나 전체 descendants를 사용하면 직접 Reply라는 합의와 어긋난다.
- 목록 한 곳만 수정하면 상세·Viewer가 빠진다. API field만 추가하거나 Storybook 숫자만 보여주는 것도 완료가 아니다.

## Risks / Limits

- canonical 조회 정책과 기존 predicate의 일치, batch 쿼리 실행 계획, 실제 UI와 actor 전환은 아직 실행 검증하지 않았다.
- 기존 `post-repost-count.test.ts`의 DB fixture를 참고하되 Reply의 viewer 조건은 별도로 실행한다. 목록 크기의
  여러 Parent와 Reply가 많은 Parent에서 쿼리 수·정확한 결과·`EXPLAIN`을 확인하고 측정 조건을 남긴다.
- 스키마는 additive field와 필요한 payload 관계 확장을 우선하며 DB migration을 예상하지 않는다. 구현에서
  데이터 변경이나 새 rollout 결정이 필요해지면 그 경계에서 다시 확인한다.
- Web 렌더 결과·CI와 iOS/Android 실제 touch·VoiceOver/TalkBack 검증은 각각 별도 증거다.

## Open Questions

- 미정인 제품·보안·적용 범위 선택은 없다. field 이름, nullability와 fragment 경계는 위 합의를 보존하는 범위에서 구현자가 정한다.
