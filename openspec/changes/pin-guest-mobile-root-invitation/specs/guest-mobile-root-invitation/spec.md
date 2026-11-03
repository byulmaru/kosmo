## ADDED Requirements

### Requirement: Guest mobile root bottom chrome

시스템은 guest인 모바일 Web의 `/`에서 하단 내비게이션과 탭을 위한 빈 공간을 표시하지 않아야 한다(MUST). 기존 방문자 안내 전체를 safe area를 고려해 화면 하단에 고정하고, 마지막 콘텐츠와 조작 요소까지 스크롤로 접근할 수 있게 해야 한다(MUST).

**Source Context:** [PROD-1232](https://linear.app/byulmaru/issue/PROD-1232)의 변경 내용·완료 조건. 기존 공개 읽기·인증·닫힘 계약은 `docs/domain/policies/public-content-onboarding.md`를 따른다. 아래는 이슈에서 확정한 동작의 세션 예시다.

#### Scenario: Enter and reload the guest mobile root

- **WHEN** 비로그인 방문자가 기존 모바일 breakpoint 미만의 Web에서 `/`에 직접 접근하거나 새로고침한다
- **THEN** 하단 내비게이션과 탭을 위한 빈 공간이 나타나지 않는다
- **AND** 닫히지 않은 방문자 안내 전체가 화면 하단에 고정된다

#### Scenario: Scroll with a narrow or short viewport

- **WHEN** 방문자 안내가 보이는 모바일 Web의 `/`에서 타임라인을 스크롤하거나 viewport·글자 크기가 바뀐다
- **THEN** 안내 문구·닫기·주 버튼·보조 링크를 포함한 전체 영역이 하단 고정을 유지한다
- **AND** safe area에서 안내의 버튼과 링크를 사용할 수 있고 마지막 콘텐츠·조작 요소도 스크롤로 접근할 수 있다

#### Scenario: Dismiss the invitation

- **WHEN** 방문자가 `가입 안내 닫기`를 실행한다
- **THEN** 안내와 그 예약 공간이 사라지고 하단 내비게이션이나 불필요한 탭용 공간은 나타나지 않는다
- **AND** 기존 상단 메뉴를 통해 가입·로그인에 계속 접근할 수 있다

### Requirement: Preserve the existing visitor actions and other surfaces

시스템은 안내의 기존 문구·닫기·인증 직접 진입·보조 링크를 유지해야 한다(MUST). 로그인 상태의 내비게이션, 데스크톱 Web, 다른 경로와 Native 앱 동작을 변경하지 않아야 한다(MUST NOT).

**Source Context:** PROD-1232의 유지 범위와 `docs/domain/policies/public-content-onboarding.md`의 인증 직접 진입·탭 단위 닫힘·Web 전용 범위.

#### Scenario: Use the existing visitor actions

- **WHEN** 방문자가 안내의 주 버튼·팀 소개·개인정보처리방침 또는 상단 메뉴의 가입·로그인을 사용한다
- **THEN** 주 버튼과 가입·로그인은 홈을 다시 거치지 않고 기존 `/login` 인증을 시작한다
- **AND** 팀 소개는 `https://byulmaru.co/about-us`, 개인정보처리방침은 `/privacy`를 연다

#### Scenario: Leave the target surface

- **WHEN** 화면이 기존 모바일 breakpoint 이상이거나 다른 route·인증 상태·Native 앱에 해당한다
- **THEN** 해당 화면의 기존 내비게이션과 안내 배치를 유지한다
- **AND** 현재 탭에서 닫은 안내는 기존 계약에 따라 닫힌 상태를 유지한다
