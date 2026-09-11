# Coding Style: API And Client Contracts

## API And Client Contracts

- GraphQL schema는 normalized cache가 자연스럽게 갱신될 수 있게 object 소유 관계를 기준으로 둔다.
- top-level query보다 object field가 더 맞는 경우가 많다. 예를 들어 account가 소유한 profile 목록은 `Account.profiles`처럼 계정 object를 타게 한다.
- 관계 상태만 scalar로 노출하기보다, 메타데이터와 캐시 갱신이 필요하면 관계 object를 노출한다.
- 삭제/해제 mutation은 클라이언트가 cache에서 제거할 정확한 대상 ID를 반환한다.
- 상태가 있는 관계 mutation은 기존 row를 state 필터 없이 먼저 조회한 뒤 state별 정책으로 분기한다.
- create input은 최소화하고 서버에서 명확한 기본값을 채운다.
- update input은 omitted과 `null`의 의미를 명확히 분리한다. 생략은 보통 변경 없음이고, nullable 도메인 필드의 `null`은 명시적 clear가 될 수 있다. non-null 도메인 필드는 update input에서 optional로 받더라도 `null`을 새 값으로 보지 않는다.
- backend error `message`를 UI에 어떻게 노출할지는 아직 정책이 완전히 정해지지 않은 영역이다. 메시지를 그대로 쓰는 코드만으로 확정 위반으로 단정하지 말고, 필요한 경우 error type/code 기반 분기, generic localized fallback, 원문 노출 허용 범위 중 무엇이 정책인지 먼저 정리한다.
