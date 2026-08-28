## Context

이 결정 기록은 PROD-816 안의 System Reserved Handle과 Explicitly Harmful Handle Expression 하위 정책,
이를 반영한 Profile 도메인과 Profile picker 계약을 구현 전에 추적하기 위한 문서다. 목록 선별에는 Bluesky
atproto의 공개 자료를 참고했지만, 제품 동작의 권위는 Kosmo canonical 문서와 PROD-816에 있다.

## Decision Records

### 시스템 예약 식별자와 명시적 유해표현을 별도 정책으로 관리한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 운영·공식 계정 사칭 위험과 명백한 유해표현은 차단 목적과 필요한 우회 대응이 다르므로 한
  규칙으로 합치면 오탐 경계가 불명확해진다.
- Decision Outcome: System Reserved Handle과 Explicitly Harmful Handle Expression을 각자의 고정 목록과
  비교 규칙을 가진 별도 정책으로 유지한다. 두 정책은 Local Profile 생성에만 적용한다.
- Alternatives Considered: 하나의 통합 목록은 규칙 차이를 잃고, 원격 handle까지 적용하는 방식은 Remote
  Profile 원본 보존 계약을 침범하므로 선택하지 않았다.
- Consequences: 목록을 변경할 때 목적과 비교 규칙을 구분해 검토해야 한다. Remote Profile에는 어느 정책도
  적용하지 않는다.
- Confirmation / Follow-up: 두 정책의 독립된 허용·거부 사례와 Remote Profile 비적용을 검증한다.

### 정책별 정규화 뒤 handle 전체의 정확 일치만 차단한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 단순 부분 문자열 차단은 정상 단어를 거부하지만, 명시적 유해표현의 underscore와 제한된
  숫자 우회는 그대로 허용할 수 없다.
- Decision Outcome: 예약 식별자는 trim과 lowercase 뒤 전체를 정확히 비교한다. 명시적 유해표현은 trim과
  lowercase 뒤 underscore를 제거한 compact 값과, 여기에 `0`→`o`, `1`→`i`, `3`→`e`, `4`→`a`를 적용한
  substituted 값을 각각 목록 전체와 정확히 비교한다. compact 원본과 substituted 값 중 하나가 일치하면
  거부한다.
- Alternatives Considered: 모든 부분 문자열 차단, 예약어에도 우회 정규화 적용, 임의 leetspeak와 Unicode
  confusable 일반화는 승인 경계를 넓히고 오탐을 키우므로 선택하지 않았다.
- Consequences: `supporter`, `cybersecurity`, `administrator_dev`, `class`, `analysis`는 이 정책의 부분 문자열
  일치만으로 거부되지 않는다. compact 원본도 검사하므로 숫자를 포함한 curated 표현을 놓치지 않는다.
- Confirmation / Follow-up: 직접 일치, 대소문자, underscore, 네 숫자 치환, 정상 단어와 부분 문자열 회귀를
  각각 검증한다.

### Local handle로 생성 가능한 현재 앱 route namespace를 예약한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 동적 Profile route와 같은 최상위 namespace를 일반 Profile이 선점하면 정적 앱 route가
  우선하거나 이후 route 확장을 막아 해당 Profile URL 계약이 불명확해진다.
- Decision Outcome: 현재 앱의 최상위 정적 route segment 중 Local handle 문자 형식으로 생성 가능한
  `bookmarks`, `compose`, `feedback`, `hashtags`, `home`, `local`, `notifications`, `search`, `settings`를 System
  Reserved Handle로 관리한다. 기존 목록의 `login`, `privacy`도 route namespace를 함께 보호한다. 하이픈을
  포함한 `follow-requests`, `profile-edit`는 handle 형식 검증으로 거부하며 underscore 별칭은 같은 route로
  간주하지 않는다.
- Alternatives Considered: 정적 route 우선순위에만 의존하면 생성은 성공하지만 Profile URL이 가려질 수 있고,
  route 문자열을 runtime에 자동 수집하면 Core 정책이 앱 파일 구조에 결합되므로 선택하지 않았다.
- Consequences: 최상위 정적 route를 추가하거나 이름을 바꿀 때 handle 문자 형식과의 교집합을 같은 변경에서
  curated 목록과 단위 사례에 반영해야 한다.
- Confirmation / Follow-up: 현재 route 교집합의 직접 일치 거부와 하이픈 route의 형식 거부를 검증한다.

### 서버를 최종 권위로 두고 공용 검증 계약을 함께 소비한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 클라이언트 검증만으로는 직접 API 호출을 막을 수 없고, 서버와 플랫폼별 목록을 복제하면
  정책이 달라질 수 있다.
- Decision Outcome: 서버는 Local Profile 생성의 모든 진입점에서 두 정책을 권위 있게 적용한다. Android,
  iOS, Web 클라이언트는 서버와 같은 공용 계약으로 사전 검증하고 거부 시 생성 mutation을 호출하지 않는다.
- Alternatives Considered: 클라이언트 단독 적용과 서버·플랫폼별 목록 복제는 각각 우회와 drift를 허용하므로
  선택하지 않았다.
- Consequences: 서버 검증은 write보다 앞서 실행되어야 한다. 배포 시점 차이에서는 서버 판단이 우선하며
  클라이언트는 최신 server rejection을 처리해야 한다.
- Confirmation / Follow-up: Core 단위 검증, API 직접 호출 통합 검증과 UI mutation 미호출 검증을 같은 사례로
  구성한다.

### 정책 오류는 기존 field error 계약과 하나의 안전한 문구로 표시한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/design/accessibility.md`, PROD-816
- Status: Active
- Context / Problem: 내부 목록과 일치한 표현 또는 raw validation message를 노출하지 않으면서 사용자가 handle을
  수정할 수 있는 위치를 알려야 한다.
- Decision Outcome: 서버는 기존 GraphQL shape 안에서 정책 위반을 handle field 오류로 반환한다. 생성 UI는
  클라이언트와 서버 정책 위반 모두에 `사용할 수 없는 단어가 포함된 핸들이에요.`를 사용하고 입력값을
  유지한다. 공용 TextField의 오류 연결과 announcement를 재사용하며 별도 시각 variant를 만들지 않는다.
- Alternatives Considered: 일치한 표현·분류 공개, raw GraphQL message 표시, 별도 banner나 중복 alert는 정보
  노출 또는 접근성 중복을 만들므로 선택하지 않았다.
- Consequences: GraphQL input·payload shape는 바뀌지 않는다. 다른 생성 실패는 정책 문구로 덮지 않고 기존의
  안전한 일반 오류와 재시도 동작을 유지해야 한다.
- Confirmation / Follow-up: `VALIDATION`과 `handle` field, 입력값 보존, input-error 연결, 단일 announcement와
  raw message 비노출을 검증한다.

### Bluesky 자료는 선별 근거로만 사용하고 정적 Kosmo 목록을 소유한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 외부 공개 목록은 초기 후보를 찾는 데 유용하지만 전체 목록의 목적과 범위가 Kosmo 정책과
  같지 않고 upstream 변경을 그대로 수용하면 제품 경계가 예고 없이 달라진다.
- Decision Outcome: Bluesky atproto의 `reserved.ts`와 `explicit-slurs.ts`는 2026-08-28의 선별 근거로만
  기록한다. 승인된 값은 Kosmo가 정적 목록으로 소유하며 runtime dependency, 자동 동기화 또는 원격 denylist를
  두지 않는다.
- Alternatives Considered: Bluesky 목록 전체 복사, runtime fetch와 자동 upstream 동기화는 불필요한 이름 차단과
  통제되지 않은 정책 변경을 만들므로 선택하지 않았다.
- Consequences: 목록 변경에는 별도 제품 검토와 canonical·서버·클라이언트 계약의 동시 갱신이 필요하다.
- Confirmation / Follow-up: 구현이 네트워크 호출이나 외부 package 없이 canonical 목록만 사용하는지 확인한다.

### 기존 충돌은 배포 대상에서 읽기 전용으로 감사하고 별도 승인된 cleanup으로 처리한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-816
- Status: Active
- Context / Problem: 새 정책과 일치하는 기존 Local Profile이 있을 수 있지만 신규 생성 차단이 기존 Profile의
  lifecycle을 소급해 바꾸는 근거는 아니다.
- Decision Outcome: 배포 대상의 기존 Local Profile을 실제 적용 정책과 같은 조건으로 읽기 전용 감사한다.
  PROD-816에는 감사만을 위한 일회성 code나 package script를 저장소에 남기지 않고, 충돌 Profile도 자동
  rename·disable·delete하지 않는다. 충돌이 있으면 영향 Profile, 사용자·URL·연합 identity 영향, 정확한 변경
  방식, rollback과 재점검 조건을 소유하는 별도 cleanup 이슈를 만들고, 승인된 forward data migration 또는
  통제된 운영 절차로만 변경한다. 앞으로 handle 재사용이 허용되더라도 두 정책이 우선한다.
- Alternatives Considered: 저장소에 남는 일회성 script는 지속해서 유지할 제품 경계가 아니므로 선택하지 않았다.
  정책 배포에서 기존 row를 자동 rename·비활성화하는 방식은 승인되지 않은 사용자 상태 변경이며, 기존 데이터를
  무시하는 방식은 배포 위험을 알 수 없어 선택하지 않았다.
- Consequences: 구현 완료 증거에는 배포 대상 감사 결과가 필요하다. 충돌이 발견되면 PROD-816 enforcement와
  분리된 cleanup 승인·실행·rollback·재점검 증거가 필요하다.
- Confirmation / Follow-up: 감사가 배포 대상 Local Profile만 읽고 write를 만들지 않는지, 결과에 일치한
  유해표현을 불필요하게 남기지 않는지, 충돌 시 별도 cleanup owner가 지정되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
