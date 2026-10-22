이 문서는 현재 소스 조사에 따른 제안이다. 구현 중 더 작은 변경으로 같은 결과를 얻을 수 있으면 수정한다.

## Current Constraints

조사 기준은 `main`의 `20538bc901985ba516161d4d8a90e37d965c2e3b`다. 아래 내용은 소스를 확인한 결과이며 실행 검증 결과가 아니다.

| 경계                | 확인한 사실과 근거                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 첫 화면             | `apps/app/src/app/index.tsx:38`은 셸 밖 Welcome이며 valid Session을 `/home`으로 보낸다. Native 인증 코드도 같은 파일에 있다.                                                                                        |
| 공개 셸             | `apps/app/src/components/shell/UniversalShell.tsx:190`은 공개 Profile·Post만 방문자 route로 판정한다. CTA 닫힘·높이 예약·drawer는 이미 공통으로 제공한다.                                                           |
| 공개 조회           | `apps/api/src/graphql/resolvers/post/query/local-timeline.ts:12`가 MEMBER 권한을 요구한다. 본문은 공용 접근 필터를 적용하며 ID 순서·cursor·최대 20개 페이지를 사용한다.                                             |
| 화면의 Profile gate | `apps/app/src/components/timeline/LocalTimelineScreen.tsx:268`은 selected Profile이 없으면 onboarding을 표시한다. API만 공개해도 guest 목록은 나타나지 않는다.                                                      |
| 목록과 캐시         | `apps/app/src/components/post/PostList.tsx:131`의 Local connection·pagination과 nullable replyProfile을 재사용할 수 있다. `RelayActorProvider.tsx`는 actor별 Environment를 이미 격리한다.                           |
| 긴 로고             | `apps/app/src/components/ui/SidebarNavigation.tsx:368`의 guest intro 하나가 full·drawer를 담당하며 compact는 설명을 숨긴다. `apps/app/src/components/BrandLogo.tsx`에 `variant="full"`과 이미지 접근성 이름이 있다. |

## Practical Approach

1. 기존 `localTimeline` 읽기 경계만 계정·선택 Profile 없이 호출할 수 있게 조정한다. 공통 인증 scope, Session 파생, Home query와 참여 mutation은 그대로 둔다. 기존 후보 SQL·접근 필터·connection·정렬·비용 상한을 재사용한다.
2. `/`의 Web confirmed guest 분기에 공통 공개 셸과 Local 목록을 조합한다. valid Session의 `/home` 이동, 유효 Session의 Profile 준비, Native Welcome, 인증 `/local` 보호 route는 유지한다. loading·Session error를 guest로 간주하지 않는다.
3. Local 화면에서 공유할 데이터·목록·실패 상태의 처리 책임만 분리하거나 기존 조합에 명시적인 공개 읽기 경계를 둔다. 인증 `/local`의 no-profile onboarding을 전역으로 삭제하지 않는다. query·cursor·edge를 수동 관리하는 별도 guest 목록은 만들 필요가 없다.
4. 공개 `/`는 기존 공개 화면처럼 중앙 콘텐츠와 메뉴 헤더를 조합하는 방향을 권장한다. 보호 `/home`·`/local`로 향하는 인증용 Home/Local 탭은 그대로 가져오지 않는다. 이는 보호 navigation을 숨기는 기존 방문자 계약에 따른 조합이며 신규 탭 정책이나 헤더 재설계가 아니다. 필요하면 기존 헤더가 화면의 로컬 목록 목적을 전달하도록 한다.
5. 공용 guest intro의 두 문구를 기존 full 로고로 교체한다. 원본 비율·contain·accessible name과 `docs/design/logo.md`의 여백·권장 크기를 유지한다. compact 80px rail은 설명 영역이 없으므로 긴 로고를 새로 넣지 않는다. 로고에 새 링크 행동을 추가할 필요는 없다.
6. `docs/domain/policies/public-content-onboarding.md`, `docs/domain/policies/post-list.md`에 승인된 공개 읽기 범위를 반영한다. `docs/design/public-content-onboarding.md`, `docs/design/local-timeline.md`, `docs/design/logo.md`에는 세 화면의 공통 로고·공개 첫 화면과 기존 인증 Local의 차이·폐기되는 Web Welcome 표현을 맞춘다. 구현 helper나 cache 구조를 canonical 요구사항으로 옮기지 않는다.

## Alternatives and Traps

- 별도 guest API·목록을 만들면 기존 Local 후보·페이지네이션·상태 처리와 어긋날 수 있다. 현재 요구에는 기존 query와 목록을 공유하는 쪽이 변경 범위가 작다.
- 기존 `/local` 화면 전체를 `/`에 넣으면 Profile gate와 인증용 탭도 따라온다. 반대로 공용 Profile gate를 없애면 인증 사용자의 준비 흐름이 바뀐다.
- `status !== 'valid'`로 공개 화면을 고르면 Session 조회 오류까지 guest로 취급한다. 현재 Session 상태를 구분한다.
- PUBLIC Quote의 Source가 FOLLOWERS·DIRECT·삭제 상태여도 Quote 자체는 기존 조건을 만족하면 남는다. 원문 접근 불가를 Quote 전체 제거로 바꾸지 않는다.
- 두 설명 문구가 사라졌는지만 검색하는 테스트는 공통 UI·읽기·인증 동작의 증거가 아니다.

## Risks / Limits

- 익명 조회 경로가 새로 열리므로 기존 페이지 상한과 후보 제외를 실제 GraphQL·DB 입력으로 검증한다. 이번 조사에서는 운영 트래픽 비용·프로덕션 동작을 측정하지 않았다. 신규 rate limit·인프라 변경을 자동으로 범위에 추가하지 않는다.
- 기존 canonical에 적힌 모든 개인 제어·Media 정책이 빠짐없이 구현되었는지는 이번 조사만으로 보장하지 않는다. 이번 변경이 기존 필터를 우회하거나 개인 상태를 다른 actor에 섞지 않는지 검증하고, 발견한 독립적인 기존 결함은 별도로 설명한다.
- 최초 query 실패, 성공 후 refresh 실패, pagination 실패를 구별하고 마지막 성공 목록·cursor·retry를 유지한다. guest→로그인 및 actor 전환은 기존 Relay Environment 경계를 사용한다.
- DB migration은 현재 조사에서 필요하지 않다. 되돌릴 때에는 공개 진입 UI와 Local 읽기 허용을 함께 되돌릴 수 있으며 데이터 변환은 없다. 실제 배포 순서와 되돌림 방법은 구현 PR의 변경 범위에 맞춰 확인한다.
- Web 자동화·Storybook은 Native runtime이나 실기기 보조 기술 검증을 대신하지 않는다. Native 공개 화면은 범위 밖이며 공유 파일의 기존 Native 로그인 분기 회귀는 확인한다.

## Open Questions

없음. PROD-1199가 공개 첫 화면·조회 허용·공통 로고·제외 범위를 정했다. 헤더 조합, 로고 배치와 fragment 분리는 이 범위 안의 구현 선택이다. 구현 중 새로운 공개 범위·권한·롤아웃 결정을 만나면 그 지점만 사용자에게 확인한다.
