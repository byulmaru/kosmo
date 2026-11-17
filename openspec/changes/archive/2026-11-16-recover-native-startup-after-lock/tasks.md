# Superseded session harness

2026-11-16 사용자 지시에 따라 2026-10-29 #1252 리뷰 요청을 반영한다.
이 디렉터리의 이전 초기 조회·자동 1회 계획은 superseded이며 현재 요구사항은 ADR 0032와 PROD-1138이 소유한다.

- 구현: 요청별 startup recovery를 제거하고 실패한 query boundary의 기존 retry를 Native 복귀에 연결한다.
- 검증: 실제 Relay·Provider 통합 회귀는 PR CI에서 실행한다. 로컬 제품 테스트는 실행하지 않는다.
- Pending: 변경된 동작의 iOS·Android 실제 OS 잠금·복귀와 원 제보 빌드 대조. 이전 head의 Native 실행 기록은 현재 head 검증으로 간주하지 않는다.
- 이 archive는 Native QA나 production 검증 완료를 뜻하지 않는다.
