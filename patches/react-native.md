# React Native KeyboardAvoidingView patch

This is maintenance context for the temporary `react-native@0.85.3` patch in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) and
[`react-native@0.85.3.patch`](react-native@0.85.3.patch). It addresses PROD-1210.

## Rationale and boundary

On Android, React Native 0.85.3 sends `keyboardDidHide` to the keyboard-frame
change handler. That handler retains the hidden event's coordinates and can
leave `KeyboardAvoidingView` with a non-zero bottom correction after the
keyboard is gone, especially after delayed layout updates. The patch routes
Android `keyboardDidHide` through the existing hide handler, matching the iOS
hide path. It changes no app component, public API, or dependency version.

The patch was created with:

```sh
pnpm patch react-native@0.85.3 --edit-dir <temporary-absolute-directory>
pnpm patch-commit <temporary-absolute-directory>
```

Keep the focused behavioral test in
[`KeyboardAvoidingView.native.test.ts`](../apps/app/src/components/post/KeyboardAvoidingView.native.test.ts)
with the patch. The test executes the installed RN implementation through the
installed Babel preset and mocks only native emitter, View, layout-animation,
and platform boundaries. It is not a replacement for device validation.
For a pre-patch comparison without changing the installed package, set
`KOSMO_TEST_RN_KAV_SOURCE` to a temporary copy of the original source.

## Removal gate

Remove this patch only after a React Native release provides equivalent Android
`KeyboardAvoidingView` hide semantics. Compare the upstream source and rerun
the focused test against the unpatched release before removing the patch and
its lockfile metadata.

## 실기기 검증 결과 — 2026-10-27

**수정본 테스트 앱에서 글쓰기와 미디어 편집기의 지속 흔들림이 관찰되지 않았고,
본문·ALT 입력과 민감도 설정이 정상 동작했다.**

Samsung SM-S926N / Android 16 / 삼성 키보드에서 실제 작성기와 미디어 편집 코드를
사용한 별도 테스트 앱으로 확인했다. 동일 APK에서 원본 RN 구현과 패치 구현을
번들 교체로 비교했다. Relay 데이터와 미디어 선택·업로드는 로컬 fixture/stub이다.

| 검증 항목             | 결과                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| 키보드 열기·닫기 반복 | 4회 모두 닫힘 후 전체 높이 복원, 잔여 보정 0                                   |
| 글쓰기 화면 안정성    | 초기 전환을 제외한 약 20초, 10Hz 205개 샘플에서 사진 도구의 수직 위치 변화 0px |
| 미디어 편집기 안정성  | 초기 전환을 제외한 약 20초, 10Hz 199개 샘플에서 ALT 도구의 수직 위치 변화 0px  |
| 본문 입력             | `PROD-1210` 입력 후 키보드 전환과 미디어 편집 완료 뒤에도 유지                 |
| ALT 입력              | `PROD-1210-ALT` 입력 후 키보드 전환과 편집 완료 뒤에도 유지                    |
| 민감도 설정           | 켠 뒤 ALT 탭 이동·키보드 열기/닫기·편집 완료 후에도 유지                       |

키보드가 닫힌 상태의 작성 영역 높이는 다음과 같았다. RN `onLayout`과 내부 보정값을
계측했고, 영상은 1/4 크기에서 도구 영역의 수직 위치를 추적해 원본 픽셀로 환산했다.
표의 0px는 해당 샘플과 추적 도구에서 관측한 값이며 화면 전체의 모든 움직임을 뜻하지 않는다.

| 기기                      | 정상 전체 높이 | 수정 전 숨김 후 높이 / 잔여 보정 | 수정 후 숨김 후 높이 / 잔여 보정 |
| ------------------------- | -------------- | -------------------------------- | -------------------------------- |
| Samsung SM-S926N          | 750.22dp       | 716.44dp / 33.78dp               | 750.22dp / 0dp                   |
| Android API 36 에뮬레이터 | 845.33dp       | 791.24dp / 54.10dp               | 845.33dp / 0dp                   |

재검증 순서는 빈 작성기에서 키보드 숨김 → 본문 입력·숨김 → 이미지 첨부·편집 →
ALT 입력·숨김 → 민감도 켜기 → ALT에서 키보드 재표시·숨김 → 민감도 값 확인 →
편집 완료 후 본문·첨부 값 확인이다. 에뮬레이터에서도 네 번의 열기·닫기와 ALT·민감도
값 유지를 확인했다.

### 비교 한계와 남은 검증

기존 실제 앱에서는 지속 흔들림을 재현했다. 별도 테스트 앱에서는 수정 전에도 지속
진동은 재현되지 않았으며, 약 15초의 150개 영상 샘플에서도 도구 위치 변화는 0px였다.
수정 전후로 직접 확인한 차이는 **키보드가 닫힌 뒤 남던 높이 보정의 제거**다.

따라서 수정본 테스트 앱의 안정성과 입력 동작은 검증됐지만, 기존 실제 앱에서 보였던
지속 흔들림의 완전 해결 판정에는 원래 증상이 재현되는 전체 앱 환경에서의 비교가 필요하다.
실제 로그인·API 업로드·게시·OTA 배포와 iOS 실기기 QA는 이번 검증에 포함하지 않았다.
