## Current Constraints

이 문서는 현재 구현을 위한 working note다. 사용자 동작은 PROD-1079과 2026-10-10 사용자 선택을 기준으로 삼으며,
파일 배치나 navigator 후보는 구현자가 바꿀 수 있다. 조사 기준은 `6681db72670757f53e130a599114a38a6217a55c`다.

| 경계       | 현재 코드와 영향                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route 수명 | `(tabs)/_layout.tsx`와 `(protected)/_layout.tsx`는 Native에서 `Stack`을 사용한다. 하단 `switch`는 `NavigationLink.tsx`에서 `replace`로 처리한다. 탭별 마지막 상세 계층을 보존하는 navigator는 없다.                   |
| 선택 표시  | `BottomTabBar.tsx`는 pathname으로 current를 정한다. Post·다른 Profile 상세에서는 탐색을 소유한 탭을 식별하지 못한다.                                                                                                  |
| Home/Local | `TimelineRoute.tsx`는 Native의 `timeline` 파라미터로 현재 목록을 선택한다. Home/Local을 바꿀 때 자식 화면은 교체되므로 두 목록이 항상 mounted된 상태라고 가정하지 않는다.                                             |
| 재선택     | `UniversalShell.tsx`와 Home/Local의 shell 재선택 등록은 Web 전용이다. 단일 handler ref에 모든 retained screen이 등록하면 비활성 화면이 active handler를 덮을 수 있다.                                                 |
| 스크롤     | Native timeline의 `InfiniteList`, 검색의 `PaginationScrollView`, 알림 목록, Profile layout의 바깥 `PaginationScrollView`가 실제 scroll owner다. pathname이나 URL 복원만으로 offset 복원·최상단 이동을 증명할 수 없다. |
| 검색       | route의 `q`·`tab`과 local 입력 state를 사용한다. 기본 `/search` 링크로 다시 진입하면 기존 결과 맥락을 잃을 수 있다.                                                                                                   |
| 갱신       | Home은 `store-or-network`와 cached-entry background refresh, Local·검색·알림·Profile은 각각 기존 query lifecycle을 가진다. retention으로 mount 횟수가 줄었다고 query freshness 계약까지 제거하지 않는다.              |
| actor      | `RelayActorBoundary`는 actor lifecycle key가 바뀌면 자식 subtree를 remount한다. 보존한 화면이 이전 actor의 데이터·권한·초안을 새 actor에 보여주지 않아야 한다.                                                        |
| 작성기     | shell의 `openComposer`는 overlay action이고 `closeComposer('created')`는 mobile에서 `/home`으로 복귀한다. 취소는 원래 화면을 유지한다.                                                                                |

경로는 `apps/app/src/app`, `apps/app/src/components`, `apps/app/src/relay` 기준이다. 링크·상세·검색·작성기의
canonical URL을 바꾸거나 다른 플랫폼용 UI route tree를 복제하는 방식은 피한다.

## Practical Approach

1. iOS의 주요 목적지에 framework가 소유하는 탭별 탐색 상태와 내부 상세 stack을 적용하는 접근부터 검토한다.
   기존 공용 `BottomTabBar` presentation과 compose action을 유지한다. 처음 연 탭은 기존 root로 진입하고,
   이미 연 탭은 마지막 leaf로 복귀한다. 실제로 동작하는 최소 topology를 택하며 특정 navigator를 계약으로 고정하지 않는다.
2. 탭 switch와 상세 push를 구분한다. 현재 탭·현재 leaf·root 여부는 navigator state로 판단한다. 하단 Profile root는
   선택 Profile을 가리키되, 다른 탭에서 연 같은 Profile·Post 상세는 그 탭 안에서 back할 수 있어야 한다.
3. 재선택은 한 입력에 한 결과만 실행한다. 상세에서는 root로 돌아가고, root에서는 실제 scroll owner를 최상단으로
   이동한다. Home/Local만 기존 refresh owner를 호출한다. 전환 중 중복 입력과 진행 중 refresh는 중복 실행하지 않는다.
4. 재선택 handler와 Native header·알림 `모두 읽음` bridge는 active route의 focus lifecycle에 맞춘다.
   retained 비활성 화면이 현재 화면의 handler·header·Unread ID를 덮지 않도록 실제 focus 전환을 검증한다.
5. 기존 Relay refresh·pagination·actor boundary를 유지한다. 탭 switch를 이유로 전체 Store를 비우거나 새 요청
   계층을 만들지 않는다. mount 기반 갱신이 retention 때문에 사라지면 기존 갱신 목적을 보존할 최소 변경을 검토한다.

구현 후보의 근거는 [Expo JavaScript tabs](https://docs.expo.dev/router/advanced/tabs/),
[Expo shared routes](https://docs.expo.dev/router/advanced/shared-routes/),
[React Navigation bottom tabs](https://reactnavigation.org/docs/bottom-tab-navigator/),
[useScrollToTop](https://reactnavigation.org/docs/use-scroll-to-top/)다. 공식 문서의 현재 API를 그대로 복사하지 않고
설치된 `expo-router` 타입과 source에서 지원 여부를 확인한다. 공용 bar는 `tabPress` 등 framework 이벤트와 이중
실행되지 않아야 한다. 기본 pop·scroll 동작이 상세에서 root만 복귀한다는 사용자 선택과 맞는지도 확인한다.

## Alternatives and Traps

- 단일 Stack에서 `replace`를 `navigate`로 바꾸는 것만으로는 네 탭의 독립적인 상세 계층을 보존했다고 볼 수 없다.
- root 데이터·offset만 수동 저장하면 마지막 상세 복원과 back 계약을 해결하지 못한다. 별도 history stack을
  추가하기보다 기존 framework navigation을 사용한다.
- 공유 상세를 탭 안에 배치하는 route group은 후보가 될 수 있다. group 없는 cold deep link의 선택과 Web URL,
  nested suffix, Push 진입을 직접 검증한다. 화면 구현을 복제하거나 기본 deep-link 목적지를 조용히 바꾸지 않는다.
- `popToTopOnBlur`, unmount 또는 key 변경으로 비활성 탭 상태를 지우면 마지막 상세 복원과 충돌한다.
- Home/Local 선택 보존은 하단 탭 왕복의 계약이다. 상단 Home/Local 사이의 swipe와 두 목록을 동시에 유지하는
  새 정책은 이 이슈에서 추론하지 않는다.
- 탭 복원으로 PROD-1051의 재현이 줄어도 실제 remount의 오류 키 재사용이 해결됐다는 증거가 되지 않는다.

## Risks / Limits

인증된 iOS runtime에서 이번 변경을 재현·검증하지 않았다. 이슈에 기록된 TestFlight와 OTA revision도 이번
세션에서 다시 확인하지 않았다. 저장소·공식 API 조사는 runtime acceptance를 대신하지 않는다.

보존한 여러 화면의 query retention, 비활성 header/handler, actor reset, drawer gesture, Profile edit 이탈 guard,
작성기 back, deep link·Push와 Web linking이 회귀 지점이다. 실제 수정 경로를 기준으로 focused test를 작성하고,
공용 Native 경로를 수정하면 Android의 기존 switch·push·back도 확인한다. iOS 동작을 Android에 확대하지 않는다.

DB·API·보안·production 설정 변경이나 rollout은 이 계획에 없다. 제품 코드 rollback은 구현 PR의 변경을 되돌리는
범위로 예상하지만 실제 배포·rollback 절차와 성공 증거는 후속 phase에서 확인한다.

## Open Questions

사용자 행동의 미정 사항은 없다. navigator와 route group의 구체적 배치는 구현 세션의 routine 선택이다.
기존 deep link·actor·Android 계약을 보존할 수 없는 선택이 나타나면 그 경계에서 사용자에게 영향과 대안을 설명한다.
