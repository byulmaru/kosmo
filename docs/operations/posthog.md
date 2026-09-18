# PostHog 제품 분석 운영

Kosmo Web의 PostHog client는 `prod` 채널에서 공개 `posthogKey`와 `posthogHost`가 모두 주입된 경우에만 초기화한다. `dev` 채널과 설정이 없는 build에는 client와 분석 요청이 없어야 한다. 현재 이 변경의 production 수집·Dashboard 설정은 일시 중지 상태이며, 이 문서는 애플리케이션 계약과 배포 후 확인 절차를 기록한다.

## Identity와 개인정보 경계

- 로그인 후 identity는 내부 immutable Account ID로 `identify`한다. Profile ID를 Account identity로 사용하지 않는다.
- Account 이름·handle·email과 같은 trait, 게시글 본문·미디어·대상 Post ID·대상/선택 Profile ID는 명시적 event property로 보내지 않는다.
- Reaction은 `❤️`만 `default`, `🥹`, `🎉`, `👀`, `☘️`, `🌈`와 앞으로 승인되지 않은 값은 `custom`으로 분류한다. 원문 emoji, ID, 이름, shortcode는 보내지 않는다.
- PostHog SDK의 identity/session metadata는 SDK 경계에서 관리하며, 애플리케이션 event property allowlist와 혼동하지 않는다.

## 명시적 event allowlist

| Event              | 허용 property                            | 발생 조건                                                                                                                           |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `repost_succeeded` | `result`: `created` 또는 `removed`       | 재게시 생성 payload의 `repost.id`, 취소 payload의 요청 재게시 `postId`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지 |
| `reaction_added`   | `reaction_type`: `default` 또는 `custom` | `addReaction` payload가 반환된 뒤                                                                                                   |
| `reaction_removed` | `reaction_type`: `default` 또는 `custom` | `deleteReaction` payload가 반환된 뒤. `reactionId: null`인 멱등 성공도 포함                                                         |
| `bookmark_added`   | 없음                                     | 생성 payload의 `bookmark.id`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지                                           |
| `bookmark_removed` | 없음                                     | 응답의 `requestedBookmarkId`가 요청 ID와 일치할 때. 다른 projection의 GraphQL error가 함께 있어도 대상 삭제가 확인되면 포함         |

각 성공 mutation 결과는 해당 callback에서 한 번만 capture한다. 클릭, 메뉴 open, optimistic state, render, count 변화만으로 event를 만들지 않는다. Network error, GraphQL error로 성공 경계를 확인할 수 없는 경우, 필요한 success payload가 없는 경우, 재게시·북마크 대상 ID가 일치하지 않는 경우에는 event를 만들지 않는다. 핵심 성공 ID와 별도 projection 오류가 함께 반환되면 성공 이벤트는 기록하되 기존 UI 오류 처리는 유지한다. Analytics 초기화·identify·capture 실패는 mutation 결과와 기존 오류 처리를 변경하지 않는다.

Account가 바뀐 뒤 늦게 완료된 이전 요청은 새 Account에 귀속하지 않는다. 같은 Account에서 Profile만 바뀐 경우에는 Account identity를 유지한다. Account 전환·로그아웃 중 SDK의 reset 또는 identify가 실패하면 제품 흐름은 계속하되, SDK의 실제 `$user_id`와 distinct ID가 현재 Account와 다시 일치할 때까지 명시적 custom event를 보내지 않는다.

## 배포 후 확인

수집을 재개할 때는 production build와 PostHog project 설정을 같은 승인된 배포 경계에서 확인한다. 실제 사용자 식별자나 콘텐츠를 ticket·스크린샷에 복사하지 않는다.

1. 설정이 없는 `dev` build에서 PostHog 요청이 없는지 확인한다.
2. production Web에서 로그인 후 Account ID 하나의 `$identify`가 발생하는지 확인한다. 이름·handle·email·Profile ID가 payload에 없는지 확인한다.
3. 재게시 생성·취소, Reaction 추가·삭제, 북마크 추가·취소를 각각 성공시켜 allowlist event와 enum만 확인한다.
4. 각 동작을 network error, 실패 응답, 필요한 payload 누락 상태에서 반복해 성공 event가 발생하지 않고 UI의 기존 오류 처리가 유지되는지 확인한다.
5. Reaction 원문과 Post·Profile 식별자가 explicit property에 포함되지 않는지 확인한다.
6. PostHog endpoint를 차단한 상태에서도 재게시·Reaction·북마크가 동일하게 완료되는지 확인한다.

집계 Dashboard, funnel 정의, native analytics, emoji별 분석은 이 운영 문서와 구현 범위에 포함하지 않는다. 수집을 재개하거나 event taxonomy를 바꿀 때는 이 문서와 canonical product contract를 함께 갱신한다.
