## Current Constraints

이 문서는 구현 세션을 위한 working note이며 제품 계약이나 영구 구현 규칙이 아니다. 기준은 `5e46484fb97a1a52a3afdfc41e8c54ecfaa1bcc5`와 PROD-1080이다.

| 경계              | 현재 코드에서 확인한 사실                                                                                                                           | 의미                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 일반 작성기       | `apps/app/src/components/post/PostComposerHost.tsx:150`은 `behavior="height"`, `keyboardVerticalOffset={insets.top}`을 사용한다.                    | 비교 대상이며 답글에서의 성공 증거는 아니다.                            |
| 답글·인용         | `apps/app/src/components/post/ReplyComposerSurface.tsx:430`은 iOS에서 `padding`을 사용하고 offset을 전달하지 않는다.                                | 공통 controller를 감싼 회피 경계가 다르다.                              |
| safe area         | `ReplyComposerSurface.tsx:183`의 `useSafeAreaPadding`이 바깥 backdrop에 네 방향 inset을 적용한다.                                                   | 키보드 좌표와 inset 소비를 함께 확인해야 한다.                          |
| 공통 mobile shell | `apps/app/src/components/post/PostComposer.tsx:995`의 중앙 ScrollView 뒤에 `:1046`의 footer가 있다. shell은 `flex: 1`, `height: '100%'`를 사용한다. | padding만 바꿔도 충분한지, 부모 높이에 실제로 맞춰지는지 측정해야 한다. |
| 테스트            | `ReplyComposerSurface.test.ts`와 `PostComposerHost.test.ts`는 KeyboardAvoidingView를 문자열 host로 모의 처리한다.                                   | 테스트 통과나 prop assertion은 실제 키보드 회피 증거가 아니다.          |

Linear의 제보 환경은 TestFlight `0.0.1 (36836991687001)`, iOS `26.7`이다. 이 정보는 사용자 제보이며 이번 세션에서 기기를 확인하지 않았다. 바이너리 소스와 기기에 적용된 OTA JavaScript revision은 구분해 기록한다. 최신 main에는 Reply 본문의 기본 Mention 등 제보 시점 이후 변경이 있어 현재 초안 동작을 기준으로 보존한다.

## Practical Approach

1. 구현 세션에서 로그인한 iOS 환경의 Reply를 열고 키보드 표시 전·후·해제·재진입의 화면을 기록한다. keyboard frame, dialog와 footer의 화면 좌표, safe area, 중앙 scroll 높이를 같은 좌표계로 대조한다. 이미지와 CW, 긴 본문을 추가해 현재 입력 위치와 작성 도구에 실제로 접근하는지 확인한다.
2. `ReplyComposerSurface`의 회피 경계를 첫 수정 후보로 삼는다. 일반 작성기의 height 방식과 top offset 적용을 비교하되, Native 측정 결과에 따라 최소 수정안을 고른다. 특정 prop을 이 명세의 필수 구현으로 고정하지 않는다.
3. 공통 mobile shell의 높이 제약이 회피된 부모 크기를 따르지 않을 때만 해당 제약을 좁혀 수정한다. 공용 shell을 수정하면 일반·인용 작성기도 같은 조건으로 확인한다. overlay의 기존 safe area 소유권을 유지하며 고정 키보드 높이·추가 SafeAreaView로 보정하지 않는다.
4. 초안·Media·CW·제출을 소유한 controller와 mutation 계약은 그대로 사용한다. keyboard 전환을 이유로 remount하거나 입력 상태를 새로 만들지 않는다. 기존 discard/pending 보호와 실패 시 초안 유지도 확인한다.

## Alternatives and Traps

- footer를 다른 위치로 복제하거나 답글 전용 작성기를 만드는 방법은 공용 작성 UI와 상태 소유권을 분리하므로 현재 문제의 첫 접근으로 삼지 않는다.
- `padding`을 `height`로 교체한 사실만으로 해결됐다고 보고하지 않는다. bottom inset의 중복 공백, 입력 가림과 키보드 해제 후 복원이 남을 수 있다.
- Storybook의 `IllustrativeKeyboard`는 정적 표시다. Web 자동화·모의 layout만으로 iOS 성공을 판정하지 않는다.
- Figma를 새로 조회하거나 재설계하지 않았다. 이번 작업은 기존 작성 UI 복구이며, 새로운 시각 결정이 필요해지면 해당 근거와 사용자 결정을 먼저 확인한다.

## Risks / Limits

실제 Reply 키보드 재현은 아직 없다. 2026-10-09 구현 세션에서 답글의 iOS `KeyboardAvoidingView`를 `height`로 바꾸고 `useSafeAreaInsets().top`을 offset으로 전달하는 후보를 적용했다. 이 선택은 이슈의 재현 설명과 일반 작성기의 기존 `height`/top-offset 경로를 근거로 삼았으며, 실제 해결 여부는 확인되지 않았다. 같은 surface의 Quote와 일반 작성기를 회귀 대상으로 확인하고, 공통 경계를 바꾸면 Android·좁은 Web·Web modal에도 영향 범위에 맞는 확인을 추가한다. 다른 플랫폼에서 같은 결함이 있다고 단정하지 않는다.

현재 Simulator 설치본은 iOS 26.5의 `0.0.1 (1)`이며 제보된 TestFlight `0.0.1 (36836991687001)` / iOS 26.7과 다르다. 화면 조작용 Orca 실행도 실패해 Reply와 키보드를 열지 못했다. 따라서 해당 설치본의 Home 화면은 재현 근거가 아니며 Native acceptance는 pending이다.

API·DB migration은 필요하지 않다. 배포는 이번 Spec 범위가 아니다. 코드 rollback은 이 레이아웃 수정만 되돌리는 방식으로 검토하며, 데이터 복구나 신규 rollout 정책을 추가하지 않는다. 전체 작성기 재설계나 새로운 제품 행동이 필요하면 PROD-1080의 좁은 복구 범위를 넘는지 먼저 확인한다.

## Open Questions

새 제품·보안·소유권 결정은 없다. 정확한 원인, 실제 기기 layout과 OTA revision은 구현 단계에서 확인할 기술적 미확인 사항이다. 검증 환경이 없으면 해당 acceptance를 pending으로 남긴다.
