## Current Constraints

- `apps/app/src/components/post/PostReactionController.tsx`가 Quick·Full Picker의 공통 mutation 성공 callback과 기존 Reaction 계측을 소유한다. `reaction_type`은 `❤️`의 `default`와 그 외 `custom`을 뜻하며 사용자 정의 이모지 여부가 아니다.
- PROD-942의 #1023은 Emoji 16 허용 집합과 정확한 Unicode 문자열 검증, #1025는 Full Picker 연결을 소유한다. 두 PR은 2026-09-27 현재 Draft다.
- `docs/operations/posthog.md`는 기존 event allowlist와 Account identity를 기록한다. 공개 고지 변경·production 수집 전환은 별도 운영 책임과 맞춰 검토한다.

## Practical Approach

- 기존 두 이벤트의 property 타입에 `emoji_kind: 'unicode'`와 종류 key를 추가한다. 미래 사용자 정의 이모지의 구체 ID·이름·shortcode·asset 정보는 현재 이벤트에 넣지 않는다.
- 선행 허용 집합에 있는 정확한 Reaction Type에만 `reaction_emoji_key`를 계산한다. 집합 밖의 값은 기존 `reaction_type` 이벤트만 유지하고 종류 property를 생략한다. 분석 코드에 별도 Unicode catalog가 생기지 않도록 전수 동등성 검사를 둔다.
- mutation 성공 경계와 analytics identity snapshot을 함께 검증한다. 다른 Account로 전환된 뒤 완료된 요청이 새 Account의 이벤트가 되지 않도록 기존 SDK 귀속 흐름을 확인하고 필요한 delta만 보완한다.
- 동일 기간·대상 Account에 적용할 재현 가능한 쿼리 또는 Insight와 해석 문서를 작성한다. `reaction_added`를 사용 Account 수와 반복 사용량의 기준으로 삼고 제거는 별도 횟수로 표시한다.

## Alternatives and Traps

- emojibase 번역 조회를 위한 표시 선택자 제거 함수는 분석 key 동일성에 사용하지 않는다.
- 추가와 제거의 차이를 현재 남아 있는 Reaction 수로 해석하지 않는다. 요청 성공 event는 DB의 실제 상태 변화 건수와도 같다고 가정하지 않는다.
- `reaction_type=custom`을 미래 사용자 정의 emoji로 해석하지 않는다.

## Risks / Limits

- 선행 Stack이 바뀌면 허용 집합·정확한 문자열 identity·공통 controller interface가 영향받는지만 확인한다.
- 실제 PostHog 수집 공백과 과거 key 없음은 backfill하지 않는다. 현재 프로젝트의 내부·테스트 Account 목록과 봇 분류 근거는 확인되지 않았다.

## Open Questions

- 없음. 운영 제외 목록이 발견되면 소유자와 적용 근거를 확인하고 기존 기준을 재사용한다.
