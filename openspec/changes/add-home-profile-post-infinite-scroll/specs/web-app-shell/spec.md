## MODIFIED Requirements

### Requirement: Profile post list data rendering

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-646` — 게시글 목록 영역은 프로필별 게시글 Relay connection의 첫 게시글 20개를 조회하고 각 edge의 node를 `PostListItem` fragment 계약으로 렌더해야 한다(MUST). 다음 page가 있으면 같은 Profile identity의 connection에서 cursor 이후 게시글을 20개씩 누적해야 하며(MUST), route state에서 edge·cursor·정렬을 합성하거나 다른 Profile의 connection과 병합해서는 안 된다(MUST NOT).

#### Scenario: Post list items display

- **WHEN** 프로필 게시글 목록 query가 첫 게시글 edge를 반환한다
- **THEN** 시스템은 각 edge의 node를 `PostListItem`으로 렌더한다
- **AND** 게시글 목록은 프로필 헤더 아래에 표시된다

#### Scenario: Append the next Profile page

- **WHEN** 같은 Profile 게시글 connection에 다음 page가 있고 사용자가 목록 하단 near-end에 도달한다
- **THEN** 시스템은 현재 cursor 이후 게시글을 최대 20개 요청해 기존 목록 뒤에 누적한다
- **AND** 기존 edge, 정렬과 현재 scroll position을 유지한다

## ADDED Requirements

### Requirement: Home post list cursor pagination

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-646` — Home 게시글 목록은 `homeTimeline` Relay connection의 첫 게시글 20개를 표시하고 다음 page가 있으면 같은 Home connection에서 cursor 이후 게시글을 20개씩 누적해야 한다(MUST). Profile 게시글 connection과 Home connection은 서로 다른 owner와 connection identity를 유지해야 한다(MUST).

#### Scenario: Append the next Home page

- **WHEN** Home connection에 다음 page가 있고 사용자가 목록 하단 near-end에 도달한다
- **THEN** 시스템은 현재 cursor 이후 게시글을 최대 20개 요청해 기존 Home 목록 뒤에 누적한다
- **AND** Profile 게시글 connection의 edge나 cursor를 읽거나 변경하지 않는다

### Requirement: Automatic post pagination lifecycle

**Authority / Provenance:** `PROD-646`, `PROD-662` — Home과 Profile 게시글 목록은 공통 Web·Native 자동 pagination lifecycle로 near-end, 다음 page 존재 여부와 진행 중 요청을 판정해야 한다(MUST). 같은 page 요청을 중복 실행해서는 안 되며(MUST NOT), 성공 뒤 viewport가 아직 채워지지 않고 다음 page가 있으면 갱신된 목록 크기로 near-end를 다시 측정해야 한다(MUST).

#### Scenario: Load once at the near-end boundary

- **WHEN** 사용자가 Web 또는 Native 게시글 목록의 near-end에 도달하고 다음 page가 있으며 요청이 진행 중이지 않다
- **THEN** 시스템은 `loadNext(20)`을 한 번 실행한다
- **AND** 해당 요청이 완료되기 전에는 같은 page 요청을 다시 실행하지 않는다

#### Scenario: Continue across short pages

- **WHEN** 다음 page 요청이 성공했지만 갱신된 목록이 viewport를 채우지 못했고 그 뒤 page가 남아 있다
- **THEN** 시스템은 갱신된 scroll metric으로 near-end를 다시 확인한다
- **AND** viewport가 채워지거나 마지막 page에 도달할 때까지 같은 guard를 적용한다

#### Scenario: Stop at the final page

- **WHEN** Relay connection이 다음 page가 없다고 반환한다
- **THEN** 시스템은 추가 게시글 요청과 다음-page loading 표시를 중단한다

### Requirement: Post pagination feedback and manual recovery

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-646` — Home과 Profile은 다음 page를 불러오는 동안 기존 게시글 아래에 loading spinner와 보조 기술용 상태 안내를 표시해야 한다(MUST). 다음 page가 실패하면 기존 게시글과 scroll position을 유지하고 하단 toast에 `게시글을 더 불러오지 못했어요.`와 `다시 시도` action을 표시해야 하며(MUST), 사용자가 action을 실행하기 전에는 같은 page를 자동으로 다시 요청해서는 안 된다(MUST NOT).

#### Scenario: Show next-page loading without replacing posts

- **WHEN** 다음 게시글 page 요청이 진행 중이다
- **THEN** 시스템은 기존 게시글을 유지하고 그 아래에 loading spinner를 표시한다
- **AND** 보조 기술에 목록을 더 불러오는 상태를 전달한다

#### Scenario: Preserve posts and offer manual retry after failure

- **WHEN** 다음 게시글 page 요청이 실패한다
- **THEN** 시스템은 기존 게시글과 cursor 위치를 유지하고 loading spinner를 닫는다
- **AND** 하단 toast에 `게시글을 더 불러오지 못했어요.`와 `다시 시도` action을 표시한다
- **AND** 사용자가 `다시 시도`를 실행할 때만 같은 다음 page를 다시 요청한다

### Requirement: Post pagination state isolation

**Authority / Provenance:** `PROD-646` — Home과 Profile은 선택 Profile·actor revision·Profile route handle 또는 timeline identity가 바뀌면 이전 owner의 page, loading, error와 retry 상태를 새 목록에 재사용해서는 안 된다(MUST NOT). actor 전환 전에 시작한 다음-page 요청의 늦은 완료는 새 actor 또는 route의 목록과 feedback를 변경해서는 안 된다(MUST NOT).

#### Scenario: Reset Profile pagination on identity change

- **WHEN** Profile route handle 또는 actor revision이 바뀐다
- **THEN** 시스템은 새 Profile owner의 첫 page와 pagination 상태를 사용한다
- **AND** 이전 Profile의 edge, cursor, loading, error 또는 retry 상태를 표시하지 않는다

#### Scenario: Reset Home pagination on actor change

- **WHEN** Home의 선택 Profile 또는 actor revision이 바뀐다
- **THEN** 시스템은 새 actor의 Home connection과 pagination 상태를 사용한다
- **AND** 이전 actor 요청의 완료가 새 Home 목록이나 feedback를 변경하지 않는다

### Requirement: Home prepend and pagination consistency

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-641`, `PROD-646` — Home은 새 Post 성공 payload를 현재 Home connection 선두에 반영하는 기존 prepend와 cursor pagination이 같은 managed connection을 사용하게 해야 한다(MUST). prepend된 Post와 다음 page edge가 함께 존재할 때 같은 Post를 중복 표시하거나 최신순 목록 순서를 뒤집어서는 안 된다(MUST NOT).

#### Scenario: Paginate after a Home prepend

- **WHEN** 새 Post가 현재 Home connection 선두에 추가된 뒤 사용자가 다음 page를 불러온다
- **THEN** 시스템은 prepend된 Post를 유지하고 cursor 이후 edge를 기존 목록 뒤에 누적한다
- **AND** 같은 Post를 중복 표시하거나 기존 최신순 순서를 뒤집지 않는다
