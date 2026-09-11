# Review Style: Posture

## Review Posture

- 발견 사항은 사용자 영향, 런타임 동작, 캐시/스키마 계약, 보안/운영 실패 가능성 순으로 판단한다.
- OpenSpec change를 구현 완료한 PR은 `openspec/changes/<change>`가 archive되고 delta가 `openspec/specs/*` active spec에 반영됐는지 확인한다. 구현과 검증이 끝났는데 change가 active로 남아 active spec이 예전 계약을 유지하면 리뷰에서 막는다.
- 추측보다 재현 근거를 우선한다. 실제 로컬 실행, target runner 실행, Storybook 렌더링, 기기/시뮬레이터 동작 확인을 근거로 삼는다.
- 단순 취향보다 "왜 이 shape가 다음 변경에서 문제가 되는지"를 설명한다.
- 변경 이유가 불명확하면 먼저 "왜 바뀌었는지"를 묻는다.
- 플랫폼 제약이 의심되면 Windows symlink, Node version, runner capability, browser/runtime API 지원 여부를 확인한다.

## Responsibility Before Remedy

- 문제가 보인다는 이유만으로 현재 함수나 package에 해결 책임을 부여하지 않는다. 잘못된 상태를 만든 주체, 그 입력을 보장해야 하는 계약 주체, 현재 component가 보정까지 소유하는지를 먼저 확인한다.
- 외부 protocol 참여자가 유효한 값을 광고하거나 제공해야 하는 계약과 Kosmo가 방어적으로 보정할 수 있다는 사실을 구분한다. 예를 들어 유효한 ActivityPub shared inbox를 광고하는 책임은 remote server에 있다. Kosmo의 개별 delivery transport가 malformed endpoint마다 서로 다른 fallback을 추가해야 한다고 바로 결론 내리지 않는다.
- 현재 위치에서 보정하면 upstream 결함을 숨기거나 component마다 다른 정책이 생기는지도 확인한다.
