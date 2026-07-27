# ADR 0013: Media Storage Service Boundary

## 상태

Accepted

## 날짜

2026-07-20

## 후속 결정

File 표현, Local Media 생성 시점과 업로드 중 상태에 관한 결정은
[ADR 0014](./0014-media-upload-lifecycle-without-file.md)가 대체한다. Media Storage Service와 Kosmo의 소유권·저장
책임 분리는 계속 적용된다.

## 결정

- Kosmo의 [Media](../objects/media.md)는 논리적 이미지와 Profile, Local Upload Account, Alt Text, Attached Post,
  Profile Representation과 조회 정책을 소유한다.
- 별도 Media Storage Service는 이미지 바이트의 수신, 검증, 저장, 파생 표현 생성과 제공을 담당할 수 있다.
  이 위임은 Kosmo가 소유하는 Media 관계와 접근 정책을 Media Storage Service로 이전하지 않는다.
- Media Storage Service가 이미지 전송 전에 저장 참조를 발급할 수 있다. Kosmo는 이 참조를 발급받은 요청
  Account와 행동 주체 Profile에 연결한 Source=Local, State=Uploading Media를 만들고 이미지 저장 성공을
  확인한 뒤 같은 Media를 Ready로 전환한다.
- 저장 참조를 알고 있다는 사실은 Local Media의 identity, 소유권, 조회 권한 또는 Post 연결 권한을 증명하지
  않는다. Post에 연결할 수 있는 Account 경계는 [ADR 0010](./0010-post-interaction-contracts.md)의 Upload
  Account 계약을 그대로 따른다.
- Media Storage Service의 endpoint, 저장 참조 형식, 접근 URL, 구체 이미지 형식과 제한, 저장 위치와 cache
  정책은 도메인 속성이 아니다.

## 결과

- Local Media는 인증된 Account/Profile의 업로드 요청에서 Uploading으로 성립하고 확인된 저장 결과가 있어야
  Ready가 된다.
- Kosmo는 Post와 Profile의 조회 정책을 통과한 Media 접근 결과만 제공한다.
- 구현 이슈와 OpenSpec은 저장 서비스 구현과 Kosmo 통합을 독립적인 전달 단위로 나눌 수 있으며, Kosmo 통합
  검증에서 두 단위의 계약을 함께 확인한다.
- 실패한 업로드와 orphan Media 정리의 구체 정책은 각 구현 이슈와 OpenSpec에서 정밀화한다.

## 문서 반영

- [Media](../objects/media.md)는 Kosmo가 소유하는 논리 Media, 업로드 상태, 저장 완료 확인과 Account/Profile
  연결 책임을 정의한다.
- [Post](../objects/post.md)는 State=Ready인 Local Media만 Attached Media가 될 수 있음을 정의한다.
