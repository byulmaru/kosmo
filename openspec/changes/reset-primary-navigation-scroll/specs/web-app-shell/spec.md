## ADDED Requirements

### Requirement: Web 주요 route 이동의 document scroll 정책

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-619`; 경계 근거 `PROD-219`, `PROD-610` — Web 앱 셸은 하단 탭, mobile drawer, compact 아이콘 레일 또는 full sidebar에서 현재 pathname과 다른 shell-level 주요 route를 선택한 forward navigation이 대상 route에 반영된 뒤 document scroll을 최상단으로 초기화해야 한다(MUST). 이 정책은 해당 breakpoint에서 제공되는 홈, 검색, 알림, 북마크, 선택 Profile과 글쓰기 진입점에 동일하게 적용해야 한다(MUST). 대상 route의 Relay 데이터가 loading·empty 상태여도 이전 route의 document scroll offset을 노출해서는 안 된다(MUST NOT). 브라우저 뒤로/앞으로 history traversal은 browser scroll restoration을 유지해야 하고(MUST), 검색 화면의 query-only `router.push`/`setParams`는 현재 document scroll과 입력 focus를 보존해야 한다(MUST). 현재 pathname을 다시 선택한 동작에는 이 route-change 초기화를 적용해서는 안 되며(MUST NOT), 현재 홈 재선택의 최상단 이동과 단일 refetch는 `PROD-610` 계약에 남겨야 한다(MUST). 이 요구사항은 Relay 데이터 새로고침 또는 Android/iOS Native navigation scroll 정책을 변경해서는 안 된다(MUST NOT).

#### Scenario: 다른 주요 route를 document 최상단에서 연다

- **WHEN** 사용자가 스크롤된 Web route에서 하단 탭, mobile drawer, compact 아이콘 레일 또는 full sidebar의
  현재 pathname과 다른 주요 route를 선택한다
- **THEN** 대상 pathname이 반영된 뒤 document scroll은 최상단에 있다
- **AND** 대상 route의 header와 첫 콘텐츠가 이전 route의 scroll offset 없이 표시된다

#### Scenario: 로딩 또는 빈 대상 route에서도 이전 offset을 노출하지 않는다

- **WHEN** 사용자가 스크롤된 Web route에서 Relay 데이터가 loading 또는 empty 상태인 다른 주요 route로 이동한다
- **THEN** 대상 상태는 document 최상단에서 표시된다
- **AND** 이전 route의 scroll offset 때문에 header나 첫 상태 surface가 viewport 위로 벗어나지 않는다

#### Scenario: 연속 route 전환은 마지막 대상 route에 수렴한다

- **WHEN** 사용자가 첫 route 전환이 완료되기 전에 서로 다른 주요 route를 연속으로 선택한다
- **THEN** 마지막으로 반영된 대상 route가 document 최상단에서 표시된다
- **AND** 이전 전환의 지연된 scroll 처리가 마지막 route의 위치를 다시 변경하지 않는다

#### Scenario: 브라우저 history traversal의 scroll 위치를 유지한다

- **WHEN** 사용자가 브라우저 뒤로 또는 앞으로 이동으로 이전 history entry를 연다
- **THEN** 앱 셸은 해당 traversal을 주요 forward navigation으로 취급해 document 최상단을 강제하지 않는다
- **AND** 브라우저의 history scroll restoration 결과를 유지한다

#### Scenario: 검색 query-only 이동의 scroll과 focus를 유지한다

- **WHEN** 사용자가 검색 route에서 query 또는 검색 탭만 변경해 pathname이 그대로 유지된다
- **THEN** 현재 document scroll 위치를 보존한다
- **AND** 검색 입력 focus를 route-change 초기화 때문에 잃지 않는다

#### Scenario: 현재 route 재선택의 소유권을 확장하지 않는다

- **WHEN** 사용자가 현재 pathname과 같은 shell navigation 항목을 다시 선택한다
- **THEN** 이 요구사항은 document 최상단 이동이나 Relay refetch를 실행하지 않는다
- **AND** 현재 홈 재선택의 최상단 이동과 단일 refetch는 `PROD-610` 계약으로만 처리한다

#### Scenario: Native navigation scroll은 변경하지 않는다

- **WHEN** 사용자가 Android 또는 iOS Native 앱의 shell navigation으로 route를 이동한다
- **THEN** 이 Web document scroll 요구사항은 Native `ScrollView` 위치 정책을 변경하지 않는다
