# PostHog 제품 분석 운영

Kosmo Web의 PostHog client는 prod 채널에서 공개 posthogKey와 posthogHost가 모두 주입된 경우에만 초기화한다. dev 채널과 설정이 없는 build에는 client와 분석 요청이 없어야 한다. 현재 production 수집·Dashboard 설정은 일시 중지 상태다. 이 문서는 앱의 event 계약과 수집 재개 후 확인 절차를 기록하며, Cloud 설정이나 수집 재개를 승인하지 않는다.

## Identity와 개인정보 경계

- 로그인 후 identity는 내부 immutable Account ID로 `identify`한다. Profile ID를 Account identity로 사용하지 않는다.
- Account 이름·handle·email과 같은 trait, 게시글 본문·미디어·대상 Post ID·대상/선택 Profile ID는 명시적 event property로 보내지 않는다.
- 프로필 bio는 명시적 event property로 보내지 않는다. Web에서 렌더링되는 프로필 상세와 공유 프로필 목록의 bio DOM 영역은 Session Replay에서 마스킹하고 autocapture에서 제외한다. 표시명·handle과 나머지 화면은 기존 수집 동작을 유지한다.
- reaction_type의 기존 의미를 유지한다. ❤️는 default이고, 그 밖의 허용된 Unicode Reaction은 custom으로 분류될 수 있다. 여기서 custom은 사용자 정의 이모지를 뜻하지 않는다.
- 허용 집합은 canonical reactionTypeSchema가 제공하는 전체 Emoji 16 Unicode sequence다. 허용된 값에는 emoji_kind: unicode와 reaction_emoji_key를 함께 보낸다. key는 unicode: 다음에 완전한 code point sequence를 소문자 16진수와 하이픈으로 이어 붙인다. variation selector, modifier, regional indicator, zero-width joiner를 정규화하거나 제거하지 않는다.
- key는 사용한 Reaction 종류를 드러내는 분석 정보이며 익명화가 아니다. 원문 emoji, Reaction DB ID, 사용자 정의 이모지 ID·이름·shortcode·asset은 보내지 않는다. 검증되지 않은 값에는 기존 reaction_type만 기록하고 emoji_kind와 key를 생략한다.
- PostHog SDK의 표준 metadata·자동 이벤트·Session Replay 동작은 별도 contract다. 이 변경은 해당 수집 surface, SDK 설정, masking 또는 retention을 바꾸지 않는다.

## 명시적 event allowlist

| Event            | 허용 property                                                       | 발생 조건                                                                                           |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| reaction_added   | reaction_type; 허용된 Unicode 값이면 emoji_kind, reaction_emoji_key | addReaction 성공 payload 뒤. 요청 시작·현재 Account와 PostHog의 $user_id 및 distinct ID가 일치할 때 |
| reaction_removed | reaction_type; 허용된 Unicode 값이면 emoji_kind, reaction_emoji_key | deleteReaction payload 뒤. reactionId가 null인 멱등 성공도 포함                                     |
| repost_succeeded | result: created 또는 removed                                        | 재게시 생성 payload의 repost.id, 취소 payload의 요청 재게시 postId를 확인한 뒤                      |
| bookmark_added   | 없음                                                                | 생성 payload의 bookmark.id를 확인한 뒤                                                              |
| bookmark_removed | 없음                                                                | 응답의 requestedBookmarkId가 요청 ID와 일치할 때                                                    |

Reaction 종류를 검증할 수 없더라도 성공 이벤트와 reaction_type은 유지한다. 종류 정보 두 property는 항상 함께 있거나 함께 없다. 사용자 정의 emoji의 종류 property는 현재 보내지 않는다.

각 성공 mutation 결과는 해당 callback에서 한 번만 capture한다. 클릭, 메뉴 open, optimistic state, render, count 변화만으로 event를 만들지 않는다. Network error, 필요한 payload가 없는 응답은 성공 event를 만들지 않는다. Account A 요청이 Account B로 전환한 뒤 완료되면 기록하지 않는다. 같은 Account 안에서 Profile만 전환한 경우에는 기존 Account identity로 기록한다. PostHog의 실제 $user_id와 distinct ID가 요청 Account와 다르거나 없으면 Reaction event를 생략한다. Analytics 초기화·identify·capture 실패는 mutation 결과와 기존 오류 처리를 변경하지 않는다.

## 종류별 사용 지표

[Reaction 종류별 사용 쿼리](../analytics/reaction-usage/README.md)는 같은 기간과 Asia/Seoul timezone에서 key별 사용 Account 수, 추가·제거 횟수, Account별 추가 횟수 분포를 계산한다. 사용자 정의 이모지는 현재 계측하지 않는다. 내부·테스트 Account 또는 봇의 검증된 제외 목록이 없어 해당 사용은 제외하지 않으며, 기간과 미적용 조건을 결과와 함께 기록한다.

쿼리는 식별된 Web 이벤트만 집계하며 전체 제품 사용량, 노출을 통제한 선호도, 또는 현재 남아 있는 Reaction 수를 뜻하지 않는다. key 없는 과거 이벤트와 수집 중단 기간을 특정 종류에 배분하거나 backfill하지 않는다. PostHog Cloud Insight를 만들거나 설정을 바꾸는 일은 이 변경 범위에 포함하지 않는다.

## 수집 재개 후 확인

수집을 재개하는 별도 승인 뒤 production build와 PostHog project 설정을 같은 배포 경계에서 확인한다. 실제 사용자 식별자나 콘텐츠를 ticket·스크린샷에 복사하지 않는다.

1. 설정이 없는 dev build에서 PostHog 요청이 없는지 확인한다.
2. production Web에서 로그인 후 Account ID 하나의 identify가 발생하는지 확인한다. 이름·handle·email·Profile ID가 payload에 없는지 확인한다.
3. Reaction 추가·삭제에서 기존 event와 allowlist property만 확인한다. Unicode 변형별 key가 달라지고 원문 Reaction과 식별자가 없는지 확인한다.
4. network error·실패 응답·payload 누락·Account 전환 뒤 늦은 callback에서 성공 event가 발생하지 않는지 확인한다.
5. PostHog endpoint 차단 상태에서도 Reaction mutation이 동일하게 완료되는지 확인한다.
6. 위 조건을 확인한 뒤 저장된 쿼리를 승인된 project에서 실행하고 결과 해석을 기록한다.

실제 PostHog Cloud 수집·Dashboard 설정, collection restart, production deployment와 production acceptance는 별도 책임이다.
