# Profile Block 통합 검증 — 2026-09-15

## 결과와 완료 경계

PROD-813은 #726 → #770 → #848 → #854 → #844 → #772의 결과를 연결한 실제 Web/API/Temporal Worker E2E를 소유한다.
이번 PR은 아래 다섯 Web 시나리오와 검증 기록을 제공한다. 전체 `add-profile-block`의 완료·archive는 아직 진행하지 않는다.

- Core의 terminal cleanup 실패 후 재호출 성공 gate 결함 때문에 task 1.3·1.4는 미완료다.
- Web E2E와 App/API 자동화 결과를 iOS·Android 또는 실제 보조기술 검증으로 일반화하지 않는다. task 3.4·4.2와 전체 완료 gate 4.3은 열려 있다.
- 통합 검증·canonical sync·archive의 owner는 PROD-813, Core 결함 수정은 PROD-821, Native presentation 검증은 PROD-823이다.
- PROD-917의 신규 UI 교체, PROD-327의 Notification source suppression, PROD-818의 ActivityPub Block/Undo, PROD-328의 비동기 물리 cleanup은 별도 범위다.

## 실행 환경

- macOS, Playwright Chromium, 실제 Web BFF·GraphQL API·Temporal test server·Worker·PostgreSQL을 실행했다.
- OIDC는 기존 테스트용 서버를 사용한다. Remote Target은 UNRESPONSIVE Instance fixture이며 실제 외부 서버와 통신하지 않는다.
- Local Account의 Membership으로 인증된 selected Profile을 사용한다. Remote Membership이나 synthetic Remote-selected capability를 만들지 않는다.
- `scripts/test-db.mjs`가 실행별 DB를 만들고 삭제한다. 기존 `kosmo` Compose PostgreSQL을 재사용하며 공용 DB를 초기화하지 않는다.
- 합친 앱의 기준은 #772 `d20ff30c57177f479d86543d99fc9c73264f8db9`다. E2E는 이 source에 이 PR의 테스트를 더한 상태에서 실행했다.

## 실제 Web/API/Worker E2E

테스트: `apps/web/e2e/profile-block.e2e.ts` — **5/5 통과, 52.6초**.

| 시나리오                    | 실행 및 관찰 결과                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Target 차단·해제      | UI Block 성공 응답·피드백을 확인한 뒤 DB에서 포착한 양방향 Follow·Request와 직접 원인 Notification 네 건의 삭제를 확인함. 기존 Reaction·Bookmark·Repost·비직접 Notification row와 read 상태는 동일함. 경고·게시물 보기·reload·cold Settings exact Unblock과 Follow 비복구를 확인함.      |
| Remote Target와 actor 전환  | 390px 직접 route에서 차단·경고·게시물 보기를 실행하고, 같은 route를 유지한 1440px에서 A→B→A 전환 후 actor별 상태와 경고 재적용을 확인함. Settings 해제 뒤 해당 관계만 제거됨.                                                                                                            |
| 취소·실패·재시도·상호 차단  | Escape 취소 시 mutation 없음과 trigger focus 복원, 한 번 주입한 GraphQL 오류에서 DB Block 없음·콘텐츠 보존을 확인함. 이후 실제 서버 재시도와 양방향 Block에서 자신의 exact 관계만 해제하고 blockedBy 상태로 수렴함.                                                                      |
| Local Target 정책 consumer  | 실제 Block mutation 뒤 양쪽 Local viewer의 Home·Local, 방향성 Bookmark, 제3자 followers·following 후보, Hashtag.relatedProfiles, 기존 Notification Node·connection·unread·mark-read와 신규 Follow·Reaction·Repost·Reply·Quote 거부를 확인함. 정상 control 결과와 보존 row를 함께 검증함. |
| Remote Target 정책 consumer | 같은 정책을 실제 Local viewer와 Remote Target 조합으로 실행함. Remote Post는 차단 전에도 Local timeline 후보가 아니므로 그 부재를 Block 효과의 증거로 삼지 않음. Remote Account 세션을 인위적으로 만들지 않음.                                                                           |

Local 직접 조회에서는 Profile Node·handle identity가 양쪽에 유지되고, Owner→Target Post·Media·Profile Post List는 조회되며
Target→Owner 콘텐츠는 숨겨진다. `searchProfiles`는 양쪽 후보를 제외한다. Local·Remote 정책 테스트는 차단 전 정상 결과를 확인한 뒤
차단 후 제외 결과와 정상 control을 함께 확인한다. Local Target은 차단 전 Local timeline에 대상 Post가 있는지도 확인한다. 신규 interaction은 유효한 입력으로 `NOT_FOUND`와 DB state 불변을 확인한다.

실패 UI 테스트의 최초 GraphQL 오류만 Playwright에서 주입했다. 성공·재시도·해제와 정책 검증은 실제 API·Worker를 통과한다.
이 오류 주입 테스트는 아래 Core의 영구 실패 후 재호출 결함을 해결하거나 검증한 증거가 아니다.
cleanup DB assertion은 성공 피드백 이후의 상태를 관찰한다. HTTP 응답보다 cleanup이 먼저 완료됐다는 엄격한 시점 보장은 Core·Worker 검증과 아래 미해결 gate의 책임이다.

```sh
COMPOSE_PROJECT_NAME=kosmo KOSMO_TEST_PORT_OFFSET=21000 \
  node scripts/test-db.mjs run -- sh -c \
  'pnpm db:test:push && pnpm --filter @kosmo/web test:e2e profile-block.e2e.ts'
```

## 합친 코드의 자동화 검증

| 검사                                                                                      | 결과                          |
| ----------------------------------------------------------------------------------------- | ----------------------------- |
| `pnpm --filter @kosmo/app check`                                                          | Relay compile·TypeScript 통과 |
| `pnpm --filter @kosmo/app test:unit`                                                      | 637/637 통과                  |
| `pnpm --filter @kosmo/api test:integration`                                               | 304 통과, 기존 skip 1, 실패 0 |
| `pnpm --filter @kosmo/api test:unit`                                                      | 41/41 통과                    |
| API `lint:schema`, `lint:tsc`                                                             | 통과                          |
| `pnpm --filter @kosmo/web check`                                                          | 통과                          |
| E2E 파일 ESLint·Prettier                                                                  | 통과                          |
| `pnpm exec openspec validate add-profile-block --strict`·문서 Prettier·`git diff --check` | 통과                          |

App/API 전체 회귀 뒤 production source를 바꾸지 않고 Core 미완료 상태와 task 3.9의 실제 consumer 설명만 정정했다.
최종 E2E는 공통 FollowButton/Relay 보완까지 합친 source에서 다시 실행했다.
독립 검토의 Local timeline baseline·cleanup 관찰 시점 지적 두 건을 보완하고 재검토에서 해소를 확인한 뒤 E2E 5/5를 다시 통과했다.

## E2E가 발견한 결함의 소유 layer

- #772: 조건부 Slot 전환이 Navigator를 다시 만들면서 Profile handle을 빈 문자열로 보내던 문제를 수정했다. 안정된 Navigator 안에서 RouteBoundary를 바꾸며, 경고 뒤 게시물 보기와 actor 전환 E2E가 통과한다.
- #854: Bookmark connection에 양방향 목록 predicate가 적용되던 문제를 canonical 방향성 direct Post predicate로 수정했다. Local/Remote·incoming/mutual·pagination·row 보존 회귀를 추가했다.
- #854: 제3자 followers/following 목록이 viewer와 차단 관계인 후보를 노출하던 문제를 cursor/limit 전 공통 후보 predicate로 수정했다. 후보 방향·pagination·guest/no-selected·row 보존 회귀를 추가했다.
- #848은 관리 API·인증·공개 payload, #844는 공통 action·Relay, #772는 화면 조립·route lifetime을 각각 소유한다. 이 PR은 그 production 코드를 중복 변경하지 않는다.

## Native runtime 확인

- iOS 17.5의 기존 iPhone 15 Pro Simulator는 부팅됐고 기존 `moe.kos` 앱의 launch·딥링크 명령도 성공했다. 화면은 흰색이며 설치 앱은 이전 SwiftUI/WKWebView 빌드로 확인됐다. 이를 현재 Expo source의 Block QA 증거로 사용하지 않는다. 확인 후 Simulator는 원래 Shutdown 상태로 복원했다.
- 현재 source는 최종 #772 `d4e03e0e562132eef9cba7cd9f68310c0f35ed34`의 임시 사본으로 확인했다. 기존 Expo 56.0.14·React Native 0.85.3을 재사용하고 `EXPO_OFFLINE=1`, `CI=1`에서 Expo CLI의 `run:ios --no-install --no-bundler --device <Simulator ID>`를 실행했다.
- CNG prebuild는 성공했고 `package.json` 변경은 없었다. 이어진 `xcodebuild`는 요청한 Simulator destination을 찾지 못해 code 70으로 종료했다. ineligible destination 목록에는 `iOS 26.5 is not installed`가 표시됐다. Simulator SDK를 명시한 `-showdestinations`에서도 같은 결과였다.
- `xcodebuild -showsdks`에는 iOS 26.5 SDK가 있고, available Simulator runtime은 17.5뿐이었다. 생성된 deployment target은 16.4다. 따라서 SDK 파일 부재나 앱의 최소 iOS 요구 위반으로 단정하지 않는다. 관찰된 실패는 현재 Xcode의 destination/platform 조건을 충족하지 못한 것이다.
- 현재 source의 `.app` build·설치·launch·Block 화면 QA에는 도달하지 못했다. Pods 설치는 `--no-install`로 생략했으며, 이후 Pods 통합·compilation의 성공 여부와 Metro·테스트 API 연결도 미검증이다. 새 SDK·도구 업그레이드나 의존성 설치는 수행하지 않았다.
- Android는 기존 Pixel 8a AVD가 가리키는 `~/Library/Android/sdk`와 emulator·kernel·system image가 없었다. `emulator -list-avds`는 exit 127, ADB 연결 기기는 0이었다. 현재 source의 Android build·설치·Block QA는 실행하지 않았다.
- Native 개발 채널은 기존 설정의 `https://dev-api.kos.moe`를 사용한다. 로컬 Web E2E의 임시 DB fixture가 Native 앱에 자동 연결되지 않으므로, 실제 QA에는 같은 구현과 검증할 관계 데이터가 준비된 기존 채널의 backend가 필요하다. 새로운 채널·localhost override·actor capability는 추가하지 않았다.

후속 owner는 사용 가능한 Xcode Simulator destination과 Android 실행 환경을 준비하고 현재 source의 Native build·설치를 완료한 뒤,
해당 채널의 테스트 backend·계정·데이터로 실제 Block 화면·confirmation·actor 전환·no-restore·VoiceOver/TalkBack을 검증해야 한다.

## 미완료 항목과 후속 owner

| 항목                    | 증거와 다음 단계                                                                                                                                                                                                                                                               | Owner                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Core 재호출 성공 gate   | 실제 DB·공개 executeProfileBlock·Worker에서 직접 원인 Notification 삭제를 영구 실패시켰다. 첫 호출이 Follow를 지운 뒤 실패하고, 두 번째 호출은 기존 Block을 성공 반환하지만 Notification은 남는다. 정상 중복 성공을 보존할 완료 근거 저장 방식 결정 후 수정·재검증이 필요하다. | PROD-821 / #726               |
| Native·보조기술         | 위 Native runtime 확인처럼 기존 iOS 앱 실행과 현재 source의 build 시도를 수행했지만 Block 화면 QA는 미실행이다. Android 실행 환경도 갖춰져 있지 않다. Web 1024px·Light/Dark 전체 조합과 실제 보조기술 역시 이 E2E의 증거가 아니다.                                             | PROD-823, 결과 통합 PROD-813  |
| 전체 consumer 완료 대조 | 이 다섯 시나리오와 선행 API/Core/Fedify 회귀를 task 4.1 전체 요구에 대조하고 Core 수정 뒤 재검증해야 한다.                                                                                                                                                                     | PROD-813                      |
| 미구현 endpoint         | Hashtag Post List·Post 검색 endpoint는 만들지 않았다. 해당 부분은 공통 후보 정책 검증과 실제 endpoint 미실행을 구분하며, 이후 endpoint 도입 이슈가 연결·E2E를 소유한다.                                                                                                        | PROD-813 / 향후 consumer 이슈 |
| 정본 동기화·archive     | 최신 Linear의 Membership 인증 정정은 반영했다. 모든 선언 task와 required validation이 완료된 뒤 active delta의 canonical sync와 archive gate를 진행한다.                                                                                                                       | PROD-813                      |

#842의 목표 부모는 이 Web E2E PR #900이다. 공식 CLI의 기존 Stack 중간 삽입 제한으로 현재 원격 Stack #899는 7-layer이고 #842 base는 #772로 남아 있다. PR·커밋을 보존하는 Stack 재생성 승인 전에는 원격 연결 완료로 간주하지 않는다. #852는 ActivityPub Block/Undo의 별도 Draft이며,
Spec Gate와 PROD-813 선행조건을 완료로 간주하지 않는다. PR Ready 상태는 해당 PR 범위의 리뷰 가능성을 뜻하며 전체 change 완료를 뜻하지 않는다.
