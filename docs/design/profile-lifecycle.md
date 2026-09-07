# Profile lifecycle 공용 UI · PROD-860

## 정본과 범위

[PROD-860](https://linear.app/byulmaru/issue/PROD-860)은 DSN-52의 비활성화·재활성화·영구 삭제를
실제 Production 공용 UI와 Storybook으로 이관한다. 디자인 정본은
[ProfileLifecycleScreen](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4870-14402)이며,
2026-09-08에 source와 다음 대표 콘텐츠를 읽어 대조했다.

- [비활성화 영향·확인](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4868-18053)
- [재활성화 확인](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4868-18147)
- [영구 삭제 acknowledgement](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5096-15083)
- [삭제 실패와 확인 유지](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4868-37698)

`ProfileLifecycle`은 대상 identity와 lifecycle content를 렌더링하는 controlled presentation이다.
Settings route·shell·target selector는 조립하지 않는다. 세션의 현재 활동 Profile을 바꾸지 않으며,
실제 권한·보존 기간·재인증·mutation·session·navigation은 PROD-815가 소유한다.
기존 [Profile spec](../../openspec/specs/profile/spec.md)의 runtime 계약을 확장하지 않는다.
이미 확정된 Linear/Figma 표현 계약의 이관이므로 새 OpenSpec이나 lifecycle 제품 정책을 추가하지 않는다.

## 컴포넌트와 표시 상태

`apps/app/src/components/profile/ProfileLifecycle.tsx`가 진입·확인·결과를 조립한다.
`ProfileLifecycleContent.tsx`는 identity와 세 확인 콘텐츠를 제공한다.
Profile identity는 `ProfileListItemContent`·Avatar, 재활성화는 `ConfirmationContent`,
확인창은 `ModalSheet`, 삭제 완료는 `StateView`, 결과 알림은 `ToastProvider`를 재사용한다.
영구 삭제의 대상·설명·acknowledgement·인증 안내·48px action 행은
별도 `ProfileLifecycleDeleteConfirmContent`로 유지한다.
비활성화와 삭제의 확인 체크 행은 lifecycle 내부에서만 공유하며 범용 Checkbox API로 승격하지 않는다.

| 입력            | 표시와 책임                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| `action`        | `deactivate`, `reactivate`, `delete` 중 현재 흐름                                 |
| `phase=entry`   | 비활성화는 활성 프로필 관리, 재활성화·삭제는 비활성 프로필 상태와 진입 action     |
| `phase=idle`    | 비활성화는 inline 영향 설명과 확인, 나머지는 modal confirmation                   |
| `phase=pending` | 확인된 acknowledgement를 유지하고 확인·취소·닫기·체크 변경 차단                   |
| `phase=error`   | 대상과 확인 내용을 유지하고 Danger Toast 제공, 같은 확정 action으로 재시도        |
| `phase=success` | 비활성화는 비활성 상태, 재활성화는 활성 관리, 영구 삭제는 identity 없는 삭제 완료 |

`onAction`은 확인 진입, `onCancel`은 취소, `onConfirm`과 `onRetry`는 실행 의도를 전달한다.
caller는 실행 시 즉시 `pending`으로 바꾸고 요청 결과에 따라 `success` 또는 `error`를 전달한다.
공용 UI는 API를 호출하거나 성공을 추측하지 않는다. 실제 caller는 대상 ID와 요청 수명을 기준으로
늦은 응답을 처리해야 한다. `profile.id` 또는 확인 action이 바뀌면 acknowledgement와 focus ref는 새로 만든다.
확인창을 닫았다가 다시 열면 acknowledgement는 해제된다. 초기 `pending`·`error` 표본은 이미 확인한
요청 상태를 나타내며 `pending`에 unchecked 상태를 노출하지 않는다.

## 접근성과 실패 복구

- 체크 행은 `checkbox` role과 checked/disabled 상태를 제공하며 전체 label이 입력 target이다.
  32px checkbox 영역 안에 20px indicator를 두고 행의 최소 입력 높이는 48px다.
- 비활성화의 첫 focus는 설명 화면이며, 취소하면 비활성화 진입 action으로 복귀한다.
  재활성화·삭제 확인은 취소에 초기 focus를 둔다. 닫힘 후 해당 trigger로 복귀하고,
  성공으로 trigger가 사라진 경우 결과 화면의 heading 영역으로 이동한다.
- Web 삭제 확인은 브라우저 기본 `<dialog>`에 `alertdialog` role을 지정해 하나의 modal surface와
  focus containment를 제공한다. React Native Web Modal이 role을 항상 `dialog`로 덮어쓰므로
  이 경로만 `ModalSheetHost.web.tsx`에서 분리한다. 기존 일반 dialog는 기존 RN Modal 경로를 유지한다.
- Web Escape와 Native back은 같은 취소 경계를 사용하며 pending에는 닫히지 않는다.
  설명은 줄바꿈과 body scroll을 허용한다.
- 오류는 Toast가 사라져도 확인 action에서 계속 재시도할 수 있다. Modal의 오류 Toast host는
  별도 Native Modal 계층에서도 안내가 보이고 읽히도록 modal 안에 둔다. 체류·교체는 기존 host를 따른다.

## Storybook과 검증 경계

`KOSMO/Patterns/Profile/Lifecycle`의 Playground는 수동 action/state/outcome·identity Controls와
Actions를 제공한다. outcome은 caller의 요청 결과만 모의하며, 성공·오류·응답 대기를 비교한다.
별도 대표 상태는 확인·pending·error·deleted·긴 identity를 보여준다.
자동 입력·callback·focus 검증은 `Lifecycle/Tests`에서만 실행하고 Controls를 비활성화한다.

검증 대상은 확인 전 disabled, keyboard acknowledgement, confirm/cancel/retry, pending 중 중복 실행·dismiss
차단, 오류 안내와 복구, 결과 표시와 focus 복귀다. Mobile 390·Compact 1024·Full 1440 및 Light/Dark를
브라우저로 검토한다. 관련 Storybook tests, 앱 타입 검사, 정적 Storybook·Web export를 실행한다.
Storybook의 공통 a11y 설정은 color-contrast를 제외하므로 자동 통과를 전체 접근성 완료로 해석하지 않는다.

PROD-815에는 실제 actor/target 선택, 권한, 인증 redirect, mutation·session 갱신, navigation,
늦은 요청 결과 처리와 Web·iOS·Android runtime·screen reader 검증이 남는다.
