# Coding Style: Spec And Policy Sync

## Spec And Policy Sync

- OpenSpec과 구현은 root field, object field, payload, error type, connection, UI 수치 단위가 서로 맞아야 한다.
- 코드가 spec과 다르면 어느 쪽이 source of truth인지 정하고 같은 PR에서 정렬한다.
- 현재 범위에서 의도적으로 미룬 정책은 코드 주석이나 OpenSpec의 decision artifact(`decisions.md`가 있으면 그 파일, 없으면 `design.md` 또는 관련 artifact)의 남은 결정으로 검색 가능하게 남긴다.
- OpenSpec decision record에는 `YYYY-MM-DD` 형식의 결정 날짜를 기록하되 날짜는 기록 순서만 나타낸다. 새 기록이 이전 기록을 대체하려면 대상을 명시하고 class와 provenance가 최신 canonical·Linear에 여전히 유효해야 하며, OpenSpec 날짜만으로 상위 계약을 덮지 않는다.
- 장기적으로 유지될 규칙은 task-specific skill보다 `memory/`에 남긴다.
