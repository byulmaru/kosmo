# PROD-1080 · 종료한 세션 메모

## 정리 이유

iOS 답글의 키보드 가림은 기존 작성 계약을 복구하는 버그다. 요구사항과 완료 기준은
[PROD-1080](https://linear.app/byulmaru/issue/PROD-1080)에 있으므로 별도 OpenSpec은 필요하지 않다.
2026-10-10 이 세션 하네스를 짧은 이력으로 줄이고 `--skip-specs`로 archive했다.
제품 버그의 해결이나 iOS 검증 완료를 의미하지 않는다.

## 구현과 확인 상태

[PR #1136](https://github.com/byulmaru/kosmo/pull/1136)은 Reply·Quote의 iOS 키보드 회피에
`height`와 top safe-area offset을 적용한 후보를 담는다. 설정 회귀 테스트는 이 값의 전달을 확인하며
실제 Native 레이아웃을 증명하지 않는다. 구현 head `4c9b3740d3e9adb38640a03f153e6303db791777`의
GitHub CI 16개가 성공했다. 이후 head의 결과는 해당 PR에서 다시 확인한다.

## 남은 검증

실제 iOS에서 이미지·CW·긴 본문, 키보드 표시·해제·재진입, safe area와 footer 조작,
caret·스크롤 접근, 초안·제출 보존 및 일반·인용 작성기의 회귀를 확인해야 한다.
이 검증은 PR과 portable handoff에 pending으로 유지한다. 검증할 앱의 바이너리와
OTA/source revision을 구분해 기록하며, 이 archive의 상태를 제품 완료 조건으로 사용하지 않는다.
