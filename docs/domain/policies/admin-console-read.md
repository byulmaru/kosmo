# Admin Console Read Policy

## 정의

Admin Console Read Policy는 durable 객체가 아니라 Tailscale 접근 제어를 통과한 Admin Console Viewer와
Account, Profile, Account-Profile Membership, Profile authored Post를 함께 소비해 운영자용 읽기 결과의 노출
필드를 결정하는 교차 객체 조회 정책이다. 이 정책은 객체를 변경하지 않으며 Admin Console Viewer를 Kosmo
도메인의 Account 또는 `Account.Operator`로 만들지 않는다.

## Admin Console Viewer

Admin Console Viewer는 Tailscale 접근 정책에 따라 Admin Console 진입이 허용된 요청 주체다. 애플리케이션은
별도의 app capability나 객체별 action을 계산하지 않는다. 진입이 허용된 Viewer는 v1의 Account, Profile,
Account-Profile Membership, Profile authored Post 읽기 projection을 모두 사용할 수 있다.

Tailscale proxy가 제공하는 login, display name과 같은 identity header는 현재 Viewer를 화면에 표시하기 위한
선택적 metadata일 뿐이며 애플리케이션 인가의 근거가 아니다.

- identity header가 없어도 Tailscale 접근 경계를 통과한 요청에는 읽기를 허용한다.
- identity header가 없으면 화면에는 `식별 정보 없는 Admin Console Viewer`로 표시한다.
- Tailscale identity를 표시할 때는 login과 display name만 사용하며 profile picture header는 사용하지 않는다.
- ingress 정규화에 실패한 identity metadata는 없는 것으로 취급하며 접근 결과를 바꾸지 않는다.
- identity header의 Account 일치 여부나 표시 이름은 추가 권한을 부여하지 않는다.
- Admin Console Viewer는 이 정책의 읽기 결과만 사용할 수 있으며 Account 인증, Profile Owner/Member 관계,
  `Account.Operator` 사실을 획득하지 않는다.

## 접근 계약

Admin Console v1은 객체별 권한을 나누지 않는 all-or-nothing 접근 모델을 사용한다.

| 요청 경계                                                  | Account | Profile | Account-Profile Membership | Profile authored Post |
| ---------------------------------------------------------- | :-----: | :-----: | :------------------------: | :-------------------: |
| Tailscale 접근 정책과 신뢰 경계를 통과함                   |  허용   |  허용   |            허용            |         허용          |
| 허용되지 않은 tailnet 주체 또는 일반 workload의 proxy 우회 |  금지   |  금지   |            금지            |         금지          |

Tailscale 접근 정책은 누가 Admin Console entry에 연결할 수 있는지를 결정한다. 애플리케이션은 그 결정을
`account.read`, `profile.read` 같은 action으로 다시 나누거나 identity header에서 추론하지 않는다. 신뢰된
proxy를 우회한 일반 workload의 ClusterIP, Pod IP 또는 공개 ingress 경로는 Admin Console 읽기 경계가 아니다.
Kubernetes node 자체와 kubelet을 포함한 node-origin 연결은 이미 node 권한을 가진 신뢰된 인프라 주체로 보고
이번 위협 모델의 차단 대상에서 제외한다.

네 projection은 같은 Viewer에게 열리지만 결과 구조에서는 분리한다. 한 projection에 다른 객체나 관계를
`null`, `0`, 빈 placeholder로 암시하거나 편의상 합치지 않는다.

## Account 조회

Admin Console Viewer의 Account 조회 결과는 다음 필드만 사용한다.

### 목록

- Account ID
- Account 표시 이름
- Account State
- 생성 시각

OIDC subject는 목록 결과에 포함하지 않는다.

### 상세

단독 Account 상세 projection은 목록 필드와 전체 OIDC subject를 반환한다. 이 projection 안에서는 다음을 함께
탐색하거나 노출하지 않는다.

- Profile 또는 Account-Profile Membership
- selected Profile과 Session 상태
- Session credential, token, OIDC session key
- private key와 그 밖의 credential 값

Profile과 Membership은 아래의 별도 projection으로만 제공한다.

## Profile 조회

공개 Profile의 노출 조건과 별개로 Admin Console Viewer의 Profile 조회 결과는 운영에 필요한 Lifecycle State와
Suspension State를 포함할 수 있다.

### 목록

목록은 Profile ID, handle, 표시 handle, 표시 이름, avatar, Profile Origin, Lifecycle State, Suspension State,
Followers Count, Following Count, 작성한 Post의 수와 조회 대상 Post 중 가장 최근 시각을 반환한다. `handle`과
`표시 handle`은 서로 다른 필드이며 둘 다 목록 projection에 포함한다. 검색어는 handle 또는 표시 이름을 대상으로
하고 Origin과 State를 각각 필터링할 수 있다. 기본 목록은 모든 Origin과 State를 포함한다.

`Followers Count`와 `Following Count`는 저장된 best-effort Follow Relationship count다. Post 수와 가장 최근 시각은
해당 Profile이 작성한 active Post 중 public 또는 unlisted인 결과에서 계산한다. Reply, Quote, Content 없는 Repost도
포함하며 삭제되었거나 followers-only/direct Post는 제외한다. Lifecycle 또는 Suspension State는 해당 Post 목록과
count의 필터가 아니므로 이 상태의 Profile이 작성한 위 조건에 해당하는 Post도 운영자가 조회할 수 있다.

### 상세

상세는 다음 Profile의 공개 표현과 운영 필드를 반환한다.

- Profile ID
- handle, 표시 handle, qualified handle
- 표시 이름, bio
- avatar, header
- Profile Link와 Remote URL
- Profile Tag
- Followers Count, Following Count
- Lifecycle State, Suspension State, Profile Origin
- Instance Domain
- 작성한 Post의 수와 조회 대상 Post 중 가장 최근 시각
- 생성 시각

현재 v1 projection은 Instance에서 Domain만 확정한다. Instance Type, Safety/Reachability/Service State와 각
사유, Instance 생성 시각, Profile 역관계는 이번 PR 범위에 포함하지 않으며 영구 제외 여부는 결정하지 않는다.

단독 Profile projection은 다음을 반환하지 않는다.

- Account ID, Account 표시 이름, OIDC subject 등 Account 식별자
- Account-Profile Membership의 존재 여부, Role, count
- selected Profile, Session 상태 또는 credential

Followers Count와 Following Count는 Profile의 소셜 관계 count이며 Membership count와 다르다. Profile의
공개 조회에서 숨겨지는 상태를 Admin Console이 반환할 수 있다는 사실은 일반 공개 Profile 정책을 변경하지
않는다. Account와 Membership은 아래의 별도 projection으로만 제공한다.

### Profile Posts 조회

Profile Posts 화면은 해당 Profile이 작성한 active public 또는 unlisted Post만 표시한다. 작성 Profile의 Lifecycle
또는 Suspension State는 이 조건의 필터가 아니다. 현재 Post의 plain text, Content Warning, Sensitive Media 여부와
Media 개수는 해당 Post의 Current Content에서만 읽는다. Reply Parent나 Repost Source의 ID 또는 내용은 projection에
포함하지 않는다.

각 Post 결과는 Post ID, Visibility, 생성 시각, 유형, 현재 Content의 plain text, Content Warning, Sensitive Media
여부와 Media 개수만 제공한다. 유형은 일반 Post, Reply, Quote, Repost 또는 Reply와 Quote 관계를 함께 가진 Post를
구분한다. 삭제되었거나 비공개인 Post와 그 Content는 반환하지 않는다. Content 없는 Repost는 Repost 자체만
표시하며 Source 내용을 가져오지 않는다.

## Account-Profile Membership 조회

Account-Profile Membership은 단독 Account/Profile projection과 분리된 relation projection이다.

Membership 결과는 다음을 제공한다.

- Account ID
- Profile ID
- Account Profile Role (`Owner` 또는 `Member`)
- 연결 시각
- 해당 Account의 Membership count
- 해당 Profile의 Membership count
- Membership에서 Account로, Account에서 Membership으로의 양방향 탐색
- Membership에서 Profile로, Profile에서 Membership으로의 양방향 탐색

양방향 탐색은 같은 Admin Console Viewer 정책 범위 안에서만 허용한다. 이 정책은 Membership의
`Profile.Owner`, `Profile.Member`, `Membership.Account` 사실을 새로 만들거나 변경하지 않는다.

## 민감 정보와 로깅

- credential, Session token, OIDC session key, private key와 같은 값은 마스킹해 반환하지 않고 조회 결과에서
  제외한다.
- Admin Console v1은 성공 조회, 상세, 관계 조회를 영속 감사하지 않는다.
- 접근 거부, trusted proxy 우회 또는 위조 identity header와 같은 Admin-specific security event도 이 정책에서
  기록·보존하지 않는다.
- identity header, 대상·결과와 보존 기간을 별도 계약으로 만들지 않는다.
- 기존 공통 runtime 오류·접근 로그의 생명주기는 이 정책에서 변경하지 않는다.

## 제외/보류

- Admin Console Viewer의 Account 자동 매핑과 `Account.Operator` 승격
- Admin Console을 통한 Account, Profile, Membership Mutation
- 객체별 Admin Console action과 권한 위임
- selected Profile, Session, credential 정보
- Admin-specific audit, security-event, query logging과 별도 보존 정책

## 확정 용어

- Admin Console Viewer: Tailscale 접근 정책에 따라 Admin Console 진입이 허용된 요청 주체
- Admin Console Read Policy: Admin Console 교차 객체 읽기 정책
