# Admin Console Read Policy

## 정의

Admin Console Read Policy는 durable 객체가 아니라 신뢰된 proxy가 전달한 capability와 Account, Profile,
Account-Profile Membership을 함께 소비해 운영자용 읽기 결과의 접근 범위와 노출 필드를 결정하는 교차 객체
조회 정책이다. 이 정책은 객체를 변경하지 않으며 Capability Holder를 Kosmo 도메인의 Account 또는
`Account.Operator`로 만들지 않는다.

## Capability Holder

Capability Holder는 신뢰된 proxy가 전달한 유효한 capability를 가진 요청 주체다. Tailscale proxy가 제공하는
login, display name과 같은 identity header는 현재 Capability Holder를 화면에 표시하기 위한 선택적 metadata일
뿐이며 인가의 근거가 아니다.

- capability가 유효하면 identity header가 없어도 조회를 허용한다.
- identity header가 없으면 화면에는 `식별 정보 없는 Capability Holder`로 표시한다.
- Tailscale identity를 표시할 때는 login과 display name만 사용하며 profile picture header는 사용하지 않는다.
- ingress 정규화에 실패한 identity metadata는 없는 것으로 취급하며 인가 결과를 바꾸지 않는다.
- identity header의 Account 일치 여부나 표시 이름은 capability에 없는 action을 부여하지 않는다.
- Capability Holder는 이 정책의 읽기 결과만 사용할 수 있으며 Account 인증, Profile Owner/Member 관계,
  `Account.Operator` 사실을 획득하지 않는다.

## Capability 계약

이 정책이 소비하는 capability의 namespace는 `byulmaru.co/cap/kosmo-admin`이다. 지원하는 action은 다음과
같다.

| action         | 허용하는 조회 범위                          |
| -------------- | ------------------------------------------- |
| `account.read` | Account 목록, 상세, OIDC subject exact 검색 |
| `profile.read` | Profile 목록과 상세                         |

Admin ingress가 wire header 정규화를 마친 뒤 이 정책에 전달하는 capability payload의 canonical envelope는
다음과 같다.

```http
Tailscale-App-Capabilities: {"byulmaru.co/cap/kosmo-admin":[{"action":["account.read"]},{"action":["profile.read"]}]}
```

정규화된 payload는 JSON object다. 이 정책의 namespace 값은 parameter object 배열이며, 각 parameter의
선택적 `action` key는 문자열 배열이다. target namespace가 없는 JSON object는 유효하지만 grant를 만들지
않는다. 다음 parameter 입력은 유효하다.

| parameter 예시                               | 판정                                                    |
| -------------------------------------------- | ------------------------------------------------------- |
| `{"action":["account.read"]}`                | `account.read` grant                                    |
| `{"action":["account.read","unknown"]}`      | `account.read`만 grant하고 unknown action은 무시        |
| `{"action":["account.read","account.read"]}` | 중복을 제거해 `account.read` 하나로 계산                |
| `{}` 또는 `{"action":[]}`                    | 유효하지만 grant 없음                                   |
| `{"action":["profile.read"],"future":true}`  | `profile.read`만 grant하고 unknown parameter key는 무시 |

정규화된 Capability payload는 다음 순서로 검증한다.

1. payload가 JSON object가 아니면 payload 전체를 malformed로 거부한다.
2. 이 정책의 namespace가 없으면 유효한 grant 없음으로 처리한다. namespace가 존재하지만 값이 배열이 아니면
   payload 전체를 malformed로 거부한다.
3. 이 정책의 namespace 배열에 object가 아닌 값이 하나라도 있으면 payload 전체를 malformed로 거부한다.
4. parameter에 `action`이 있고 그 값이 배열이 아니거나 문자열이 아닌 항목을 하나라도 포함하면 payload 전체를
   malformed로 거부한다.
5. 이 정책의 namespace가 아닌 key와 parameter의 알 수 없는 key는 grant를 만들지 않고 무시한다.
6. `action` 누락과 빈 배열은 유효하지만 grant를 만들지 않는다.
7. 알 수 없는 action은 권한을 부여하지 않고 무시한다. wildcard action은 지원하지 않으며 `*`도 알 수 없는
   action으로 취급한다.
8. 여러 valid parameter object가 있으면 지원 action을 합집합으로 계산하고 중복 action은 하나로 축약한다.

따라서 malformed payload, 필요한 action이 없는 payload, capability가 없는 요청은 해당 조회 범위를 허용하지
않는다. identity header는 이 검증을 대신하지 않는다.

## Action 조합

| 보유 action                     | Account | Profile | Account-Profile Membership |
| ------------------------------- | :-----: | :-----: | :------------------------: |
| 없음                            |  금지   |  금지   |            금지            |
| `account.read`                  |  허용   |  금지   |            금지            |
| `profile.read`                  |  금지   |  허용   |            금지            |
| `account.read` + `profile.read` |  허용   |  허용   |            허용            |

권한이 없는 객체 또는 관계는 `null`, `0`, 빈 placeholder로 바꾸지 않고 결과 구조에서 제외한다. 직접 조회가
정책 action을 충족하지 않으면 대상 데이터 계산 전에 접근을 거부한다.

## Account 조회

`account.read`가 있을 때만 Account를 조회한다. Account의 일반 자기 자신/운영자 조회와 별개로 이 정책의
조회 결과는 다음 필드만 사용한다.

### 목록과 기본 검색

- Account ID
- Account 표시 이름
- Account State
- 생성 시각

OIDC subject는 목록 결과에 포함하지 않는다. OIDC subject를 사용한 검색은 전체 값의 exact match만 허용하며,
부분 문자열·prefix·contains 검색은 제공하지 않는다. exact match 결과도 목록 조회 결과를 사용하고 OIDC
subject 자체는 상세 조회에서만 반환한다.

### 상세

단독 Account 상세 projection은 목록 필드와 전체 OIDC subject를 반환한다. 이 projection 안에서는 다음을 함께
탐색하거나 노출하지 않는다.

- Profile 또는 Account-Profile Membership
- selected Profile과 Session 상태
- Session credential, token, OIDC session key
- private key와 그 밖의 credential 값

Account ID는 관계 조회 권한이나 Profile 조회 권한을 대신하지 않는다. 두 action을 모두 가진 경우에도
Profile과 Membership은 아래의 별도 Membership relation projection으로만 제공한다.

## Profile 조회

`profile.read`가 있을 때만 Profile을 조회한다. 공개 Profile의 노출 조건과 별개로 Admin Console 조회 결과는
운영에 필요한 Lifecycle State와 Suspension State를 포함할 수 있다.

### 목록

목록은 Profile ID, handle, 표시 handle, 표시 이름, avatar, Profile Origin, Lifecycle State, Suspension State를
반환한다. `handle`과 `표시 handle`은 서로 다른 필드이며 둘 다 목록 projection에 포함한다.

### 상세

상세는 다음 Profile의 공개 표현과 운영 필드를 반환한다.

- Profile ID
- handle, 표시 handle, qualified handle
- 표시 이름, bio
- avatar, header
- Profile Link와 Remote URL
- Profile Tag
- Followers Count, Following Count
- Profile Origin, Profile Lifecycle State, Profile Suspension State
- Instance Domain
- 생성 시각

현재 v1 projection은 Instance에서 Domain만 확정한다. Instance Type, Safety/Reachability/Service State와 각
사유, Instance 생성 시각, Profile 역관계는 이번 PROD-689 범위에 포함하지 않으며 영구 제외 여부는 결정하지
않는다.

단독 Profile projection은 다음을 반환하지 않는다.

- Account ID, Account 표시 이름, OIDC subject 등 Account 식별자
- Account-Profile Membership의 존재 여부, Role, count
- selected Profile, Session 상태 또는 credential

Followers Count와 Following Count는 Profile의 소셜 관계 count이며 Membership count와 다르다. Profile의
공개 조회에서 숨겨지는 상태를 Admin Console이 반환할 수 있다는 사실은 일반 공개 Profile 정책을 변경하지
않는다. 두 action을 모두 가진 경우에도 Account와 Membership은 아래의 별도 Membership relation
projection으로만 제공한다.

## Account-Profile Membership 조회

Account-Profile Membership은 단독 Account/Profile projection과 분리된 relation projection이다.
`account.read`와 `profile.read`를 모두 가진 경우에만 조회한다. 한 action만 있는 경우 Account나 Profile
결과에 Membership 존재 여부, Role 또는 count를 포함하지 않는다.

Membership 결과는 다음을 제공한다.

- Account ID
- Profile ID
- Account Profile Role (`Owner` 또는 `Member`)
- 연결 시각
- 해당 Account의 Membership count
- 해당 Profile의 Membership count
- Membership에서 Account로, Account에서 Membership으로의 양방향 탐색
- Membership에서 Profile로, Profile에서 Membership으로의 양방향 탐색

양방향 탐색은 두 action을 모두 검증한 뒤 같은 정책 범위 안에서만 허용한다. 이 정책은 Membership의
`Profile.Owner`, `Profile.Member`, `Membership.Account` 사실을 새로 만들거나 변경하지 않는다.

## 민감 정보와 로깅

- credential, Session token, OIDC session key, private key와 같은 값은 마스킹해 반환하지 않고 조회 결과에서
  제외한다.
- Admin Console v1은 성공 조회, 검색, 상세, 관계 조회를 영속 감사하지 않는다.
- capability 없음, malformed capability, 필요한 action 부족, trusted proxy 우회 또는 위조 header와 같은
  Admin-specific security event도 이 정책에서 기록·보존하지 않는다.
- capability snapshot, identity header, 검색값, 대상·결과와 보존 기간을 별도 계약으로 만들지 않는다.
- 기존 공통 runtime 오류·접근 로그의 생명주기는 이 정책에서 변경하지 않는다.

## 제외/보류

- Capability Holder의 Account 자동 매핑과 `Account.Operator` 승격
- Admin Console을 통한 Account, Profile, Membership Mutation
- wildcard와 capability 위임
- Profile과 Account 사이의 hidden relation을 단일 action으로 노출하는 조회 결과
- selected Profile, Session, credential 정보
- Admin-specific audit, security-event, query logging과 별도 보존 정책

## 확정 용어

- Capability Holder: capability를 보유한 Admin Console 요청 주체
- Admin Console Read Policy: Admin Console 교차 객체 읽기 정책
- capability namespace: `byulmaru.co/cap/kosmo-admin`
- `account.read`: Account 읽기 action
- `profile.read`: Profile 읽기 action
