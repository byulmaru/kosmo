## MODIFIED Requirements

### Requirement: Post visibility dropdown selection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/design/reply-composer.md`, `PROD-648`, [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4) (PROD-462 완료 전 Composer 임시 계약) MUST: 유니버설 앱은 새 Post·Reply·Quote Composer에서 선택한 Local Profile의 기본 Post Visibility를 초기값으로
사용하고(MUST), 게시글 공개 범위를 platform에 맞는 menu 또는 modal control로 개별 변경할 수 있게 해야
한다(MUST). PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하기 전까지 Composer는
`PUBLIC`, `UNLISTED`, `FOLLOWERS`만 선택·제출할 수 있게 해야 하며(MUST), `DIRECT`는 기존 enum과 서버 계약을
유지한 채 Composer 표면에서 숨겨야 한다(MUST).

#### Scenario: 공개 범위 옵션 표시

- **WHEN** PROD-462가 완료되기 전에 사용자가 Composer의 공개 설정 control을 연다
- **THEN** 시스템은 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위 옵션만 표시한다
- **AND** 시스템은 `DIRECT` 공개 범위 옵션, “언급한 계정만” 라벨, 설명 또는 아이콘을 표시하지 않는다
- **AND** `PUBLIC` 옵션은 “공개”와 “모두가 볼 수 있어요.” 설명을 표시한다
- **AND** `UNLISTED` 옵션은 “조용한 공개”와 “모두가 볼 수 있지만 검색되지 않아요.” 설명을 표시한다
- **AND** `FOLLOWERS` 옵션은 “팔로워만”과 “팔로워만 볼 수 있어요.” 설명을 표시한다
- **AND** `PUBLIC` 옵션은 Lucide `GlobeIcon` 아이콘을 표시한다
- **AND** `UNLISTED` 옵션은 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** `FOLLOWERS` 옵션은 Lucide `LockIcon` 아이콘을 표시한다

#### Scenario: Profile 기본 공개 범위

- **WHEN** 새 Post·Reply·Quote Composer가 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나인 Profile 기본값과 함께
  처음 표시된다
- **THEN** Composer는 해당 값을 선택한 공개 범위로 시작한다
- **AND** 공개 설정 control은 해당 값의 label과 icon을 표시한다
- **AND** Reply Visibility는 Parent와, Quote Visibility는 Source·Parent와 독립적이다

#### Scenario: 기본값 unavailable fallback

- **WHEN** Profile 기본값이 없거나 설정 조회가 실패·unavailable 상태인 새 Composer가 표시된다
- **THEN** Composer는 `UNLISTED`를 privacy-safe fallback으로 사용한다
- **AND** 다른 Profile의 마지막 설정값을 재사용하지 않는다
- **AND** 공개 설정 control과 외곽선 없는 본문 입력은 하나의 외곽선 editor surface 안에 표시된다
- **AND** 공개 설정 control은 본문 입력 영역 앞에 표시된다

#### Scenario: 공개 범위 변경

- **WHEN** 사용자가 공개 설정 surface에서 다른 공개 범위 옵션을 선택한다
- **THEN** Composer의 선택 공개 범위를 사용자가 선택한 값으로 갱신한다
- **AND** 현재 선택된 공개 범위를 제출 전 확인할 수 있게 표시한다
- **AND** 공개 설정 surface를 닫는다
- **AND** Profile의 기본 Post Visibility를 자동으로 변경하지 않는다

#### Scenario: 열린 draft와 다음 Composer의 독립성

- **WHEN** Composer를 연 뒤 같은 Profile의 기본 Post Visibility가 변경된다
- **THEN** 현재 draft의 선택 Visibility를 자동으로 덮어쓰지 않는다
- **AND** 다음 새 Composer는 갱신된 Profile 기본값으로 시작한다

#### Scenario: Composer 문맥 전환 격리

- **WHEN** selected Profile, Reply Parent 또는 Relay Environment가 바뀐다
- **THEN** 새 문맥의 첫 commit부터 본문, 새 Profile의 기본 Visibility, Media, error와 pending을 초기 상태로
  시작한다
- **AND** 이전 Profile 또는 Environment의 늦은 설정 조회·upload·mutation completion은 새 draft를 변경하지
  않는다

#### Scenario: DIRECT 신규 선택·제출 불가

- **WHEN** 사용자가 Composer의 공개 설정 surface 또는 키보드 탐색을 통해 새 공개 범위로 `DIRECT`를 선택하거나
  제출하려 한다
- **THEN** 시스템은 `DIRECT` 선택지를 노출하지 않는다
- **AND** 시스템은 새 `createPost` mutation에 `visibility: DIRECT`를 전달하지 않는다
- **AND** 사용자는 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 선택해 기존 게시 동작을 계속 사용할 수 있다

#### Scenario: PROD-462 복원 기준

- **WHEN** PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하고 그 계약의 검증
  증거가 승인된다
- **THEN** Composer의 DIRECT 옵션 복원은 해당 완료를 근거로 한 별도 변경에서만 수행한다
- **AND** 그 완료 전에는 이 임시 세 옵션 계약을 유지한다
