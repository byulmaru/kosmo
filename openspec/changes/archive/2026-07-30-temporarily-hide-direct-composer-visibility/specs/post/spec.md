## MODIFIED Requirements

### Requirement: Post visibility dropdown selection

**Authority / Provenance:** `docs/domain/objects/post.md` (Post Visibility와 Post 작성 입력 계약), [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4) (PROD-462 완료 전 Composer 임시 계약; 이 authority에 따라 이 requirement는 MUST로 적용한다.)

유니버설 앱은 새 글 작성 컴포넌트에서 게시글 공개 범위를 platform에 맞는 menu 또는 modal control로 선택할 수 있게 해야 한다(MUST). PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하기 전까지 새 글 작성 컴포넌트는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 선택·제출할 수 있게 해야 하며(MUST), `DIRECT`는 기존 enum과 서버 계약을 유지한 채 Composer 표면에서 숨겨야 한다(MUST).

#### Scenario: 공개 범위 옵션 표시

- **WHEN** PROD-462가 완료되기 전에 사용자가 작성 컴포넌트의 공개 설정 control을 연다
- **THEN** 시스템은 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위 옵션만 표시한다
- **AND** 시스템은 `DIRECT` 공개 범위 옵션, “언급한 계정만” 라벨, 설명 또는 아이콘을 표시하지 않는다
- **AND** `PUBLIC` 옵션은 “공개”와 “모두가 볼 수 있어요.” 설명을 표시한다
- **AND** `UNLISTED` 옵션은 “조용한 공개”와 “모두가 볼 수 있지만 검색되지 않아요.” 설명을 표시한다
- **AND** `FOLLOWERS` 옵션은 “팔로워만”과 “팔로워만 볼 수 있어요.” 설명을 표시한다
- **AND** `PUBLIC` 옵션은 Lucide `GlobeIcon` 아이콘을 표시한다
- **AND** `UNLISTED` 옵션은 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** `FOLLOWERS` 옵션은 Lucide `LockIcon` 아이콘을 표시한다

#### Scenario: 기본 공개 범위

- **WHEN** 작성 컴포넌트가 처음 표시되고 프로필 기본 공개 범위 값이 제공되지 않는다
- **THEN** 시스템은 `UNLISTED`를 기본 공개 범위로 선택한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED` 라벨을 표시한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED`의 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** 공개 설정 control은 작성자 프로필 헤더가 아니라 본문 입력 영역 아래에 표시된다
- **AND** 공개 설정 control은 제출 버튼과 같은 줄에 표시된다

#### Scenario: 공개 범위 변경

- **WHEN** 사용자가 공개 설정 surface에서 다른 공개 범위 옵션을 선택한다
- **THEN** 시스템은 작성 컴포넌트의 선택 공개 범위를 사용자가 선택한 값으로 갱신한다
- **AND** 시스템은 현재 선택된 공개 범위를 제출 전 컴포넌트에서 확인할 수 있게 표시한다
- **AND** 시스템은 공개 설정 surface를 닫는다

#### Scenario: DIRECT 신규 선택·제출 불가

- **WHEN** 사용자가 Composer의 공개 설정 surface 또는 키보드 탐색을 통해 새 공개 범위로 `DIRECT`를 선택하거나 제출하려 한다
- **THEN** 시스템은 `DIRECT` 선택지를 노출하지 않는다
- **AND** 시스템은 새 `createPost` mutation에 `visibility: DIRECT`를 전달하지 않는다
- **AND** 사용자는 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 선택해 기존 게시 동작을 계속 사용할 수 있다

#### Scenario: PROD-462 복원 기준

- **WHEN** PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하고 그 계약의 검증 증거가 승인된다
- **THEN** Composer의 DIRECT 옵션 복원은 해당 완료를 근거로 한 별도 변경에서만 수행한다
- **AND** 그 완료 전에는 이 임시 세 옵션 계약을 유지한다
