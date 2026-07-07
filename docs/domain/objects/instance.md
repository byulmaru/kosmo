# Instance 객체

## 정의

Instance는 원격 Profile, Post, Media가 속한 원격 서버를 나타내는 durable 객체다. Domain Limit과 Domain
Block은 별도 rule 객체가 아니라 Instance가 가진 safety 상태 값이다. 원격 서버의 응답 가능성은 safety
상태와 별도인 reachability 상태로 기록한다.

## 상태

### Instance Safety State

| 값           | 의미                                 |
| ------------ | ------------------------------------ |
| Normal       | 원격 Instance에 safety 제한이 없다   |
| Domain Limit | 원격 Instance의 도달 범위를 제한한다 |
| Domain Block | 원격 Instance를 없는 것처럼 취급한다 |

### Instance Reachability State

| 값          | 의미                                           |
| ----------- | ---------------------------------------------- |
| Reachable   | 원격 Instance가 응답 가능하다고 판단된 상태    |
| Unreachable | 원격 Instance의 응답 실패가 관측된 상태        |
| Suspended   | 원격 Instance의 명시적 정지 신호가 관측된 상태 |

## 속성

| 속성              | 타입/nullability                  | 검증 정책                          | 상태별 존재 조건 | 조회 권한          |
| ----------------- | --------------------------------- | ---------------------------------- | ---------------- | ------------------ |
| Domain            | 문자열, 필수                      | 원격 Instance 식별자               | 항상             | `Account.Operator` |
| safety 상태       | Instance Safety State, 필수       | Normal, Domain Limit, Domain Block | 항상             | `Account.Operator` |
| reachability 상태 | Instance Reachability State, 필수 | Reachable, Unreachable, Suspended  | 항상             | `Account.Operator` |
| safety 사유       | 문자열, nullable                  | Audit Log 대상                     | 제한/차단 상태   | `Account.Operator` |
| reachability 사유 | 문자열, nullable                  | 관측 실패 또는 원격 정지 신호 기록 | 응답 불가/정지   | `Account.Operator` |
| 생성 시각         | 시각, 필수                        | 미정                               | 항상             | `Account.Operator` |

## 관계

| 관계           | 대상                    | 조건                                  | 조회 권한          |
| -------------- | ----------------------- | ------------------------------------- | ------------------ |
| 운영자 Account | [Account](./account.md) | safety 상태 변경 주체                 | `Account.Operator` |
| 원격 Profile   | [Profile](./profile.md) | Instance에 속한 Remote Profile        | `Account.Operator` |
| 원격 Post      | [Post](./post.md)       | Instance에 속한 Remote Profile의 Post | `Account.Operator` |
| 원격 Media     | [Media](./media.md)     | Instance에서 온 Remote Media          | `Account.Operator` |

## 행동

| 행동              | 행동 주체 Account | 대상 객체 | 입력값       | 권한                          | 결과                                             |
| ----------------- | ----------------- | --------- | ------------ | ----------------------------- | ------------------------------------------------ |
| Instance 등록     | 시스템            | Instance  | Domain       | `Lookup.RemoteTargetEligible` | Normal/Reachable 상태의 Instance가 생성된다      |
| Domain Limit 적용 | 운영자 Account    | Instance  | Domain, 사유 | `Account.Operator`            | Instance Safety State가 Domain Limit이 된다      |
| Domain Block 적용 | 운영자 Account    | Instance  | Domain, 사유 | `Account.Operator`            | Instance Safety State가 Domain Block이 된다      |
| Domain 제한 해제  | 운영자 Account    | Instance  | Domain       | `Account.Operator`            | Instance Safety State가 Normal이 된다            |
| 응답 불가 표시    | 시스템            | Instance  | 실패 사유    | `System.InstanceStateSource`  | Instance Reachability State가 Unreachable이 된다 |
| 원격 정지 표시    | 시스템            | Instance  | 정지 신호    | `System.InstanceStateSource`  | Instance Reachability State가 Suspended가 된다   |
| 원격 요청 재개    | 시스템            | Instance  | 성공 관측    | `System.InstanceStateSource`  | Instance Reachability State가 Reachable이 된다   |

## 권한

| 권한                         | 종류 | 성립 조건                            | 대표 참조                  |
| ---------------------------- | ---- | ------------------------------------ | -------------------------- |
| `System.InstanceStateSource` | 독립 | 시스템이 Instance 상태 관측 원본이다 | Instance reachability 갱신 |

## 불변 조건

- 하나의 Domain은 하나의 Instance를 식별한다.
- Domain Limit은 원격 Instance를 완전히 차단하지 않는다.
- Domain Block은 원격 Instance의 콘텐츠와 관계 후보를 viewer에게 없는 것처럼 취급한다.
- Instance Safety State 변경은 기존 Notification을 삭제하거나 Read State를 바꾸지 않는다.
- Unreachable은 원격 요청을 일시 중단하는 상태이며, 그 자체로 공개 콘텐츠 노출 정책을 바꾸지 않는다.
- Suspended는 원격 Instance가 명시적으로 정지된 상태이며, 새 원격 요청을 막는다.
- 공개 차단 목록은 제공하지 않는다.

## 확정 용어

- Instance: Instance
- Domain Limit: Domain Limit
- Domain Block: Domain Block
- Instance Safety State: Instance Safety State
- Instance Reachability State: Instance Reachability State

## 제외/보류

- 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로 분리한다.
