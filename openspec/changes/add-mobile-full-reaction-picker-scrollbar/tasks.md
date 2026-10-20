## Session Work

현재 이슈의 구현·검증 인계 목록이다. 소유자는 각 항목의 PROD-1163 구현 담당자이며, PROD-1175·PROD-1174의 구현 완료에 의존하지 않는다.

- [ ] 1.1 PROD-1163: 현재 목록 측정·scroll 경로와 플랫폼 표시기의 실제 drag 지원을 확인하고, 승인된 세 모바일 환경에서 필요한 최소 보완을 선택한다.
- [ ] 1.2 PROD-1163: 스크롤 중 표시·바 드래그 중 유지·종료 후 숨김과 같은 목록 위치 이동을 구현한다. 수용 결과: 앞·중간·끝 이동, 유효 범위 제한, 취소·검색 remount·닫기 정리가 동작한다.
- [ ] 1.3 PROD-1163: 실제 가용 폭에 바의 조작 공간을 포함하고 이모지·검색·상단 핸들과 분리한다. 수용 결과: 이모지 target을 줄이지 않고 입력 겹침을 없애며, 숨겨진 바·짧은 목록·Empty·Loading은 입력을 가로채지 않는다.
- [ ] 1.4 PROD-1163: 실제 목록의 scroll·바 drag·검색 변경·크기 변경·취소를 실행하는 회귀 검증을 작성한다. 계산 helper를 분리한 경우에도 실제 목록 이동 연결을 함께 검증하며 소스 문자열 검사로 대체하지 않는다.
- [ ] 1.5 PROD-1163: 모바일 Web·iOS·Android runtime에서 긴 Browse·긴/짧은 검색 결과, 회전·글자 크기·keyboard·시트 높이, 선택·기존 닫기와 접근성을 확인한다. 기기·OS·브라우저·빌드를 기록하고 자동화와 실제 관찰을 나눈다.

## Implement 인계

- 표시·드래그·비간섭 구현과 unit/Storybook 회귀 코드를 작성했다. checkbox의 runtime 결과는 CI·실기기 검증 후 갱신한다.
- GitHub CI `Test (App)`이 앱 typecheck·unit·Storybook build와 interaction을 실행하고, `Lint`가 표준 lint를 실행한다. Web export build와 세 플랫폼 실기기 touch·보조 기술 관찰은 이 job들에서 실행하지 않는다.
- 검증 실행은 Test phase에 인계한다. Spec 문서 검증과 정적 검사는 앱 동작 통과 증거가 아니다.

## Verification Evidence

- Result: 구현·회귀 코드 작성. 앱 테스트·runtime은 미실행, GitHub CI 인계 대기.
- Checks: Spec 문서 검증 결과는 Humanize Gate 이후 portable handoff에 기록한다. 다음 구현은 실제 목록 이동과 비간섭을 확인한다.
- Limits: 최초 제보 환경과 플랫폼 표시기의 drag 지원은 미확인이다. Web 자동화는 Native touch·보조 기술 검증을 대체하지 않는다.

## Progress

- Status: Active
- Completed: 사용자 적용 범위·동작 결정, Linear 반영·readback, 현재 main 조사와 Spec 초안 작성.
- Next: Draft PR의 최신 head에서 GitHub CI와 플랫폼별 runtime 결과를 확인한다.
- Last updated: 2026-10-20
