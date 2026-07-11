# Instance 객체

## 정의

Instance는 Profile이 속한 서버를 나타내는 durable 객체다. 현재 Kosmo 서버인 Local Instance와 외부 서버인
Remote Instance를 구분하고, safety 정책, 통신 실패 관측, 서비스 정지를 서로 다른 상태 차원으로 가진다.

## 상태

### Instance Type

| 값     | 의미                            |
| ------ | ------------------------------- |
| Local  | 현재 Kosmo가 운영되는 Instance  |
| Remote | 외부에서 운영되는 원격 Instance |

### Instance Safety State

| 값           | 의미                                 |
| ------------ | ------------------------------------ |
| Normal       | Instance에 safety 제한이 없다        |
| Domain Limit | 공개 탐색 범위를 제한한다            |
| Domain Block | 원격 Instance를 없는 것처럼 취급한다 |

### Instance Reachability State

| 값          | 의미                                   |
| ----------- | -------------------------------------- |
| Reachable   | Instance 요청이 성공할 수 있는 상태    |
| Unreachable | 응답 실패로 새 원격 요청을 중단한 상태 |

### Instance Service State

| 값        | 의미                                           |
| --------- | ---------------------------------------------- |
| Active    | Instance가 서비스를 제공하는 상태              |
| Suspended | 원격 Instance의 명시적 정지 신호가 반영된 상태 |

## 속성

| 속성              | 타입/nullability | 검증 정책                               | 존재 조건                         | 조회 조건                | 조회 권한          |
| ----------------- | ---------------- | --------------------------------------- | --------------------------------- | ------------------------ | ------------------ |
| Domain            | 문자열, 필수     | 정규화된 Host이며 Instance별로 유일하다 | 항상                              | 연결된 Profile 조회 정책 | 없음               |
| Safety 사유       | 문자열, nullable | 상태 변경 입력을 보존한다               | Safety State가 Domain Limit/Block | 운영자 조회              | `Account.Operator` |
| Reachability 사유 | 문자열, nullable | 마지막 응답 실패 관측을 보존한다        | Reachability State가 Unreachable  | 운영자 조회              | `Account.Operator` |
| Service 사유      | 문자열, nullable | 원격 정지 신호의 근거를 보존한다        | Service State가 Suspended         | 운영자 조회              | `Account.Operator` |
| 생성 시각         | 시각, 필수       | 생성 결과로 기록하며 변경 불가          | 항상                              | Instance 운영 조회       | `Account.Operator` |

## 관계

| 관계    | 대상                    | 방향                | cardinality | 존재 조건           | 조회 조건            | 조회 권한 |
| ------- | ----------------------- | ------------------- | ----------- | ------------------- | -------------------- | --------- |
| Profile | [Profile](./profile.md) | Instance <- Profile | 1 -> 0..N   | Profile이 존재할 때 | 각 Profile 조회 정책 | 없음      |

하나의 정규화된 Domain은 하나의 Instance만 식별하고 현재 Kosmo에는 Local Instance가 하나만 존재한다. 모든
Profile은 Instance 하나와 연결되며 Profile Origin은 연결된 Instance Type과 같다. Post와 Media의 Instance는 각각
Author Profile과 Media Profile에서 파생한다.

## 행동

| 행동                 | 행동 주체      | 대상 객체 | 입력값    | 권한                                 | 조건                                                                | 결과                                                                                     |
| -------------------- | -------------- | --------- | --------- | ------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local Instance 등록  | 시스템         | Instance  | Domain    | `System.LocalInstanceSource`         | Local Instance가 없고 Domain이 현재 Kosmo Host다                    | Type=Local, Safety=Normal, Reachability=Reachable, Service=Active인 Instance가 생성된다  |
| Remote Instance 등록 | 시스템         | Instance  | Domain    | `System.RemoteInstanceSource`        | 같은 Domain의 Instance가 없고 원격 식별이 성공했다                  | Type=Remote, Safety=Normal, Reachability=Reachable, Service=Active인 Instance가 생성된다 |
| Domain Limit 적용    | 운영자 Account | Instance  | 사유      | `Account.Active`, `Account.Operator` | Type이 Remote이고 Safety State가 Domain Limit이 아니다              | Safety State가 Domain Limit이 되고 Safety 사유가 기록된다                                |
| Domain Block 적용    | 운영자 Account | Instance  | 사유      | `Account.Active`, `Account.Operator` | Type이 Remote이고 Safety State가 Domain Block이 아니다              | Safety State가 Domain Block이 되고 Safety 사유가 기록된다                                |
| Domain 제한 해제     | 운영자 Account | Instance  | 없음      | `Account.Active`, `Account.Operator` | Type이 Remote이고 Safety State가 Domain Limit 또는 Domain Block이다 | Safety State가 Normal이 되고 현재 Safety 사유가 제거된다                                 |
| 응답 불가 관측       | 시스템         | Instance  | 실패 사유 | `System.InstanceStateSource`         | Type이 Remote이고 Reachability State가 Reachable이다                | Reachability State가 Unreachable이 되고 사유가 기록된다                                  |
| 응답 성공 관측       | 시스템         | Instance  | 없음      | `System.InstanceStateSource`         | Type이 Remote이고 Reachability State가 Unreachable이다              | Reachability State가 Reachable이 되고 현재 Reachability 사유가 제거된다                  |
| 원격 정지 신호 반영  | 시스템         | Instance  | 정지 근거 | `System.InstanceStateSource`         | Type이 Remote이고 Service State가 Active다                          | Service State가 Suspended가 되고 Service 사유가 기록된다                                 |
| 원격 정지 해제 반영  | 시스템         | Instance  | 해제 근거 | `System.InstanceStateSource`         | Type이 Remote이고 Service State가 Suspended다                       | Service State가 Active가 되고 현재 Service 사유가 제거된다                               |

각 상태 변경 행동은 명시한 상태 차원만 바꾸며 다른 상태 차원은 유지한다. Instance Type은 생성 뒤 바꾸지 않는다.

## 권한

| 권한                          | 종류 | 성립 조건                                    |
| ----------------------------- | ---- | -------------------------------------------- |
| `System.LocalInstanceSource`  | 독립 | 시스템이 현재 Kosmo Instance 설정의 원본이다 |
| `System.RemoteInstanceSource` | 독립 | 시스템이 원격 Instance 식별 결과의 원본이다  |
| `System.InstanceStateSource`  | 독립 | 시스템이 연결/서비스 상태 관측의 원본이다    |

## 조회 정책

- 새 원격 요청은 Remote Instance의 Safety State가 Domain Block이 아니고 Reachability State가 Reachable이며
  Service State가 Active일 때만 보낸다.
- Domain Limit은 새 원격 요청을 막지 않지만 공개 Post List와 공개 검색 후보에서 해당 Remote Instance 콘텐츠를
  뺀다.
- Domain Block은 해당 Remote Instance의 Profile, Post, Media와 관계 후보를 viewer에게 없는 것처럼 취급한다.
- Local Instance의 Safety/Reachability/Service State는 Normal/Reachable/Active를 유지한다.
- Instance 상태 변경은 기존 Notification Item의 존재나 Read State를 바꾸지 않는다.
- 공개 차단 목록은 제공하지 않는다.

## 확정 용어

- Instance: Instance
- Local Instance: Local Instance
- Remote Instance: Remote Instance
- Instance Type: Instance Type
- Domain Limit: Domain Limit
- Domain Block: Domain Block
- Instance Safety State: Instance Safety State
- Instance Reachability State: Instance Reachability State
- Instance Service State: Instance Service State

## 제외/보류

- 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로 분리한다.
