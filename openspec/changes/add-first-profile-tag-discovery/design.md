## Current Constraints

기준 main은 `20538bc901985ba516161d4d8a90e37d965c2e3b`다. PROD-1146 PR #1254는 `f171bf55f99a23704d7c01d597276c97da7bd75d`에서 조사했으며 아직 미병합이다. 아래 접근은 현재 코드에 맞춘 제안이며 함수·경로를 영구 계약으로 만들지 않는다.

- `FirstProfileOnboardingRoute.tsx`는 첫 단계에서 Profile을 생성·선택하고 선택 단계마다 `saveStep`으로 저장한다. 완료는 추가 저장 없이 성공 상태를 만든다.
- `app/first-profile/[step].tsx`의 완료 화면 `시작하기`는 현재 `/home`으로 이동한다. 후속 사람 찾기를 연결할 지점이다. 완료 요약의 태그는 표시 이름만 있으므로 조회에는 저장된 `Profile.tags`의 Hashtag `id`와 `name`을 함께 사용한다.
- 기존 `HashtagRelatedProfileList`·`ProfileListItem`·`FollowButton`과 `Hashtag.relatedProfiles`를 재사용할 수 있다. 새 서버 API나 별도 팔로우 저장 모델은 현재 근거상 필요하지 않다.

## Practical Approach

1. 선행 PR의 최신 완료 연결부를 확인하고 첫 Profile 흐름의 마지막 진입에 저장 Profile ID와 태그 조회를 연결한다. 온보딩 초안이나 `tagInput`을 조회 조건으로 넘기지 않는다. 태그가 없으면 기존 후속 이동을 유지한다.
2. 태그 선택 영역과 선택 태그의 관련 Profile 목록을 조합한다. Hashtag Node별 pagination을 유지하고 이미 읽은 목록을 보존한다. 기존 초기 fallback은 generic 제목만 보여 주므로 태그 맥락과 retry 상태를 목록 바깥에서 유지하는 구성을 검토한다.
3. 같은 Relay actor Environment의 normalized Profile 상태와 공용 FollowButton을 사용한다. 태그를 바꿔도 같은 Profile의 결과를 읽고, 진행 중 중복 요청·실패 시 rollback·늦은 응답을 실제 조합에서 검증한다.
4. 진행 action은 팔로우 여부와 무관하게 홈의 후속 흐름으로 연결한다. PROD-1148이 없으면 기존 홈 이동을 유지하면서 그 이슈가 연결할 경계를 남긴다. Coachmark·앱 알림 구현을 포함하지 않는다.

## Alternatives and Traps

- 이름을 새로 정규화해 검색하거나 태그별 Profile을 수동 복제하면 identity와 상태가 갈라질 수 있다. 저장된 Hashtag ID와 normalized Profile을 그대로 사용한다.
- API에 본인 제외 조건이 없고 기존 행은 본인의 팔로우 버튼만 숨긴다. 새로 본인을 제외하거나 본인뿐인 목록을 빈 목록으로 바꾸지 않는다.
- 현재 뮤트 여부로 관련 Profile 후보를 숨기지 않는다. 기존 정책을 따른다는 문구를 새 뮤트 필터를 추가하라는 뜻으로 해석하지 않는다.
- 첫 Profile의 선택 정보 오류는 생성된 Profile 사용을 막지 않는다. 사람 찾기의 조회 오류도 첫 Profile 저장·생성을 다시 실행하는 복구 경로로 연결하지 않는다.
- 기존 FollowButton Relay 테스트의 일부 pending·actor 교체 사례는 차단 해제다. 이를 다중 태그 팔로우의 실행 증거로 사용하지 않는다.

## Risks / Limits

- 소스 조사는 API 재사용 가능성을 보여 주지만 다중 태그 UI의 상태 일치를 실행으로 증명하지 않는다.
- 태그 전환으로 버튼이 재마운트될 때 pending 상태와 중복 실행 방지가 유지되는지 확인해야 한다.
- 새 DB·서버 정책·migration은 계획하지 않는다. 구현 중 실제 필요가 발견되면 근거와 범위를 다시 확인한다.
- 로컬·CI·Web E2E·iOS·Android runtime·운영 결과는 구분한다. 이 세션은 구현과 runtime 테스트를 수행하지 않았다.

## Open Questions

없음. 선행 PR과 후속 안내의 최신 구현 상태는 구현 세션에서 재조회한다.
