# Session 객체

## 정의

Session은 Account가 Kosmo에 인증된 상태를 유지하기 위해 발급받은 credential의 서버 생명주기를 소유하는
durable 객체다. Session은 credential을 사용하는 한 클라이언트 환경의 인증 단위이며, 같은 Account에는 서로
독립적인 Session이 여러 개 존재할 수 있다.

Session 폐기는 OIDC provider의 전역 로그인 상태나 다른 Session을 함께 종료하지 않는다.

## 상태

### Session State

| 값      | 의미                                                          |
| ------- | ------------------------------------------------------------- |
| Active  | Session credential로 인증을 시도할 수 있는 상태               |
| Revoked | 명시적인 Session 폐기로 인증 자격을 잃은 terminal 상태        |
| Expired | 적용되는 유효 기간 정책이 끝나 인증 자격을 잃은 terminal 상태 |

Revoked와 Expired Session은 Active로 돌아가지 않는다. 인증 경계는 Active Session만 현재 Session으로 인정하며,
Revoked 또는 Expired Session의 credential로 인증이 필요한 요청을 수행할 수 없다.

## 속성

| 속성      | 타입/nullability | 검증 정책                            | 존재 조건 | 조회 조건              | 조회 권한      |
| --------- | ---------------- | ------------------------------------ | --------- | ---------------------- | -------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경하지 않는다 | 항상      | 현재 Session 내부 조회 | `Session.Self` |

Session credential의 원문은 Session의 조회 가능한 속성이 아니다.

## 관계

| 관계    | 대상                    | 방향               | cardinality | 존재 조건 | 조회 조건              | 조회 권한      |
| ------- | ----------------------- | ------------------ | ----------- | --------- | ---------------------- | -------------- |
| Account | [Account](./account.md) | Session -> Account | N -> 1      | 항상      | 현재 Session 내부 조회 | `Session.Self` |

## 행동

| 행동              | 행동 주체 | 대상 객체 | 입력값             | 권한                             | 조건                                                                                                                  | 결과                                                                                                                                                                  |
| ----------------- | --------- | --------- | ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session 생성      | Account   | Session   | 검증된 로그인 결과 | `Account.Active`                 | 검증된 로그인 결과가 Account와 연결된다                                                                               | Account에 속한 새 Active Session이 생성된다                                                                                                                           |
| 현재 Session 폐기 | Account   | Session   | 없음               | `Account.Active`, `Session.Self` | 요청 credential을 검증한 서버 인증 경계가 대상 Session을 식별하며, 클라이언트가 다른 Session 식별자를 지정하지 않는다 | Active Session은 Revoked가 된다. 인증 뒤 경쟁 요청으로 이미 Revoked 또는 Expired가 된 Session은 terminal 상태를 유지한다. 같은 Account의 다른 Session은 바뀌지 않는다 |
| Session 만료      | 시스템    | Session   | 없음               | 없음                             | Active Session이 적용되는 유효 기간 정책을 더 이상 만족하지 않는다                                                    | Session State가 Expired가 된다                                                                                                                                        |

현재 Session 폐기는 상태 수준에서 멱등이다. 폐기 완료 뒤 같은 credential로 시작한 새 요청은 인증 경계에서 거부되며,
폐기 전에 인증을 마친 경쟁 요청은 Session을 다른 terminal 상태로 덮어쓰지 않는다.

`Account.Active`와 `Session.Self`는 현재 Session 폐기 행동의 진입 권한이며 클라이언트 로그아웃의 완료 조건이
아니다. credential이 Suspended/Deleted Account 또는 Revoked/Expired Session을 가리키면 인증 경계는 이 권한을
성립시키지 않고 폐기 행동에 진입하지 않지만, 서버는 해당 credential이 이미 인증에 사용될 수 없음을 확정할 수
있다.

클라이언트는 서버가 현재 Session의 폐기를 확정하거나 credential이 이미 인증 불가능한 상태임을 확정한 뒤에만
caller-owned credential과 해당 Session에 종속된 상태를 제거하고 로그아웃 성공으로 전환한다. DB timeout,
네트워크 오류, 응답 유실처럼 최종 상태를 확정할 수 없는 실패에서는 성공으로 전환하지 않고 credential을 유지한
채 같은 Session 폐기를 재시도할 수 있어야 한다.

## 권한

| 권한           | 종류      | 성립 조건                                                                  |
| -------------- | --------- | -------------------------------------------------------------------------- |
| `Session.Self` | 객체 종속 | 요청 credential을 검증한 서버 인증 경계가 요청의 현재 Session으로 식별한다 |

## 조회 정책

- 현재 Session 조회는 요청 credential로 식별된 Active Session만 반환한다.
- credential이 Revoked 또는 Expired Session을 가리키면 현재 Session을 반환하지 않는다.
- 현재 계약은 다른 Session의 목록과 조회를 제공하지 않는다.

## 확정 용어

- 세션: Session
- 현재 세션: Current Session
- 세션 상태: Session State
- 세션 폐기: Session Revoke

## 제외/보류

- absolute expiration과 idle expiration의 채택 여부, 기간 및 사용 시각 갱신 정책
- 동일한 로그인 결과에서 기존 Active Session을 재사용할지 새 Session을 생성할지에 관한 정책
- Session 목록, 전체 로그아웃과 분실 기기의 원격 Session 폐기
- Session 폐기 시각과 감사 이력의 저장·노출
- Revoked/Expired Session의 보존 기간과 cleanup, 기존 Session migration·rollout·rollback
- OIDC provider logout 또는 global SSO logout
- 공개 API의 mutation 이름, payload와 transport별 error 표현
