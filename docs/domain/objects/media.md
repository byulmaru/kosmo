# Media 객체

## 정의

Media는 Post Content와 Profile 표현에 사용되는 Kosmo의 논리적 이미지다. Local upload와 Remote 원본,
state, Media와 연결된 Profile, Local Upload Account와 접근 결과를 소유한다. Post에서 사용하는 Alt Text는
[Post Content](./post-content.md)의 revision별 Media node가 소유한다. 이미지 byte, 원본·파생 파일 표현의
검증·저장·변환과 제공은 Media Storage Service가 소유한다.

## 상태

### Media Source

| 값     | 의미                   |
| ------ | ---------------------- |
| Local  | Kosmo에서 시작한 Media |
| Remote | 원격 Instance의 Media  |

### Media State

| 값        | 의미                                                                 |
| --------- | -------------------------------------------------------------------- |
| Uploading | Local Media의 제한된 업로드 권한은 발급됐지만 저장 성공은 미확인이다 |
| Ready     | 이미지 저장 성공이 확인되어 제품 관계에 사용할 수 있다               |

Remote Media는 등록 시 Ready다.

## 속성

| 속성              | 타입/nullability | 검증 정책                      | 존재 조건             | 조회 조건            | 조회 권한             |
| ----------------- | ---------------- | ------------------------------ | --------------------- | -------------------- | --------------------- |
| Upload Expires At | 시각, 필수       | 제한된 업로드 권한의 만료 시각 | Source가 Local        | Upload Account 조회  | `Media.UploadAccount` |
| Ready At          | 시각, 필수       | 저장 성공을 확인한 시각        | State가 Ready인 Local | Media 조회 정책 통과 | 없음                  |
| Original URL      | URL, 필수        | 저장 서비스가 확정한 공개 원본 | State가 Ready인 Local | Media 조회 정책 통과 | 없음                  |
| Original MIME     | 문자열, 필수     | 저장 서비스가 확정한 원본 형식 | State가 Ready인 Local | Media 조회 정책 통과 | 없음                  |
| Remote URL        | URL, 필수        | 원격 Media 원본 위치           | Source가 Remote       | Media 조회 정책 통과 | 없음                  |
| Remote Fetched At | 시각, nullable   | 마지막 성공 fetch 결과로 갱신  | Source가 Remote       | 운영 조회            | `Account.Operator`    |

Media Storage Service의 opaque 저장 참조는 Local Media를 외부 저장 결과와 연결하는 persistence 정보다. 저장
참조 형식은 Media 속성이나 공개 identity가 아니며 Kosmo API consumer에게 노출하지 않는다.
Original URL과 Original MIME column은 additive rollout과 기존 Ready row backfill 동안 nullable이며, backfill이
끝난 정상 상태에서는 Ready Local Media가 두 값을 모두 가져야 한다.

## 관계

| 관계                     | 대상                              | 방향                  | cardinality | 존재 조건                             | 조회 조건              | 조회 권한             |
| ------------------------ | --------------------------------- | --------------------- | ----------- | ------------------------------------- | ---------------------- | --------------------- |
| Profile                  | [Profile](./profile.md)           | Media -> Profile      | 1 -> 1      | 항상                                  | Media 조회 정책 통과   | `Media.Profile`       |
| Upload Account           | [Account](./account.md)           | Media -> Account      | 1 -> 1      | Source가 Local                        | Media 조회 정책 통과   | `Media.UploadAccount` |
| Referencing Post Content | [Post Content](./post-content.md) | Media <- Post Content | 1 -> 0..N   | State가 Ready이고 document에서 참조됨 | Post 조회 정책 통과    | 없음                  |
| Profile Representation   | [Profile](./profile.md)           | Media <- Profile      | 1 -> 0..N   | State가 Ready이고 연결됨              | Profile 조회 정책 통과 | 없음                  |

Local Media의 Profile은 upload를 시작할 때 선택된 Profile이다. Remote Media의 Profile은 원본 Remote Profile이며,
Instance는 이 Profile에서 파생한다.

Post Content에서 Media를 참조하는 요청은 Source=Local, State=Ready이고 행동을 요청한 Account와 Upload
Account가 같은 Media만 사용할 수 있다. 같은 Upload Account를 가진 Local Media는 Media Profile과 Post Author
Profile이 달라도 참조할 수 있다.

## 행동

| 행동              | 행동 주체 | 대상 객체 | 입력값                     | 권한                                    | 조건                                                                                                       | 결과                                                                                     |
| ----------------- | --------- | --------- | -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local 업로드 시작 | Profile   | Media     | 없음                       | `Account.Active`, `Profile.Member`      | 행동 주체는 선택된 Active/Normal Profile이고 Media Storage Service가 제한된 업로드 권한을 발급한다         | Source=Local, State=Uploading인 Media와 행동 주체 Profile/요청 Account 관계가 생성된다   |
| Local 업로드 완료 | Profile   | Media     | Uploading Media            | `Account.Active`, `Media.UploadAccount` | Source가 Local이고 State가 Uploading이며 Media Storage Service에서 이미지 저장 성공과 원본 표현이 확인된다 | 같은 Media의 State가 Ready가 되고 Ready At, Original URL과 Original MIME이 함께 기록된다 |
| Remote Media 등록 | 시스템    | Media     | Remote Profile, Remote URL | `System.RemoteMediaSource`              | Remote Profile의 Instance가 새 원격 요청 허용 상태이고 같은 Remote URL의 Media가 없다                      | Source=Remote, State=Ready인 Media와 Remote Profile 관계가 생성된다                      |
| Remote Media 갱신 | 시스템    | Media     | Fetch 결과                 | `System.RemoteMediaSource`              | Source가 Remote이고 Profile의 Instance가 새 원격 요청 허용 상태다                                          | 원격 속성과 Remote Fetched At이 갱신된다                                                 |

Local 업로드 완료는 Media identity, Profile과 Upload Account를 바꾸지 않는다. 저장 참조를 알고 있다는 사실만으로
Media 완료, 조회 또는 Post 연결 권한을 부여하지 않는다.
이미 Ready인 Local Media의 반복 완료 요청은 외부 저장 확인이나 persistence write를 반복하지 않고 같은 Media
identity와 최초 Ready At을 반환한다.

## 권한

| 권한                       | 종류      | 성립 조건                                         |
| -------------------------- | --------- | ------------------------------------------------- |
| `Media.Profile`            | 객체 종속 | 행동/요청 Profile이 Media의 Profile이다           |
| `Media.UploadAccount`      | 객체 종속 | 요청 Account가 Local Media의 Upload Account다     |
| `System.RemoteMediaSource` | 독립      | 시스템이 Remote Media 원본 정보를 반영하는 주체다 |

## 조회 정책

- Uploading Local Media는 Upload Account만 업로드 상태 확인과 완료 요청을 위해 조회할 수 있다.
- Ready Media만 Post Content에서 참조하거나 Profile Representation으로 연결할 수 있다.
- 현재 Post Content에서 참조하는 Ready Media는 해당 Post 조회 정책을 통과한 viewer만 조회할 수 있다.
- Profile avatar/header로 연결된 Ready Media는 해당 Profile 조회 정책을 통과한 viewer만 조회할 수 있다.
- 아직 Post나 Profile에 연결되지 않은 Ready Local Media는 요청 Account가 Media의 Upload Account일 때 조회할 수
  있다.
- Remote Media는 Profile의 Instance Safety State가 Domain Block이 아니어야 한다.
- viewer의 Profile Domain Block 대상 Instance에서 온 Remote Media는 viewer에게 없는 것처럼 취급한다.
- Profile의 Instance Reachability State가 Unreachable이거나 Service State가 Suspended이면 새 fetch와 원본
  재검증을 보내지 않지만 기존에 허용된 표현의 공개 범위를 자동으로 바꾸지 않는다.
- 현재 Post Content의 Sensitive Media가 true면 그 revision이 참조하는 모든 Media 표시를 가린다.
- avatar 표현은 400x400 crop, header 표현은 1500x500 crop을 기준으로 한다.
- Original URL은 Ready 전환 때 저장한 persistence metadata다. 이를 API나 protocol에 노출하는 것은 위 조회 정책을
  통과한 projection의 책임이며 URL 자체를 권한 증명으로 사용하지 않는다.

## 확정 용어

- 미디어: Media
- Media Source: Media Source
- Media State: Media State
- 업로드 중: Uploading
- 사용 가능: Ready
- 원격 미디어: Remote Media

## 제외/보류

- 업로드 만료 뒤 상태 전이, 완료 전 업로드 취소, 삭제와 orphan Media 정리는 현재 행동에서 제외한다.
- Media Proxy 조회는 Mutation이 아니므로 행동에서 제외한다.
- Media Storage Service의 endpoint, 저장 참조 형식, URL 조립 규칙, 구체 이미지 형식과 제한, 저장 위치와 cache
  정책은 도메인 계약으로 고정하지 않는다. Kosmo는 완료 응답의 Original URL과 MIME을 그대로 저장한다.
- 구체 MIME type 목록, Hash, EXIF, dedupe, 이미지 변환 실패 삭제 정책, 바이러스 스캔과 성인물 탐지는
  구현/OpenSpec에서 다룬다.
- Remote Media의 Media Storage Service 저장 projection은 실제 Remote Media 저장 구현에서 정밀화한다.
- Remote 원본의 Alt Text 수집·보존과 Post Content로의 투영은 Remote Media 구현에서 정밀화한다.
