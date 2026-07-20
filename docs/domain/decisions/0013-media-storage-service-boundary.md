# ADR 0013: Media Storage Service Boundary

## 상태

Accepted

## 날짜

2026-07-20

## 결정

- Kosmo의 [Media](../objects/media.md)는 논리적 이미지와 Profile, Local Upload Account, Alt Text, Attached Post,
  Profile Representation, File 표현과 조회 정책을 소유한다.
- 별도 Media Storage Service는 이미지 바이트의 수신, 검증, 저장, 파생 표현 생성과 제공을 담당할 수 있다.
  이 위임은 Kosmo가 소유하는 Media 관계와 접근 정책을 Media Storage Service로 이전하지 않는다.
- Media Storage Service가 이미지 전송 전에 저장 참조를 발급할 수 있다. Kosmo는 이 참조를 발급받은 요청
  Account와 행동 주체 Profile을 연결해 유지하고 이미지 저장 성공을 확인한 뒤에만 Source=Local인 Media와
  Original File 표현을 성립시킨다.
- 저장 참조를 알고 있다는 사실은 Local Media의 identity, 소유권, 조회 권한 또는 Post 연결 권한을 증명하지
  않는다. Post에 연결할 수 있는 Account 경계는 [ADR 0010](./0010-post-interaction-contracts.md)의 Upload
  Account 계약을 그대로 따른다.
- [File](../objects/file.md)은 특정 persistence row나 저장소 구현을 전제하지 않는다. Kosmo 내부에 저장된 기존
  File 표현과 Media Storage Service가 제공하는 File 표현은 같은 도메인 계약을 따를 수 있다.
- Media Storage Service의 endpoint, 저장 참조 형식, 접근 URL, 구체 이미지 형식과 제한, 저장 위치와 cache
  정책은 도메인 속성이 아니다. 이 결정은 기존 Media/File 표현의 일괄 migration이나 제거를 요구하지 않는다.

## 결과

- Local Media 생성은 인증된 Account/Profile의 업로드 요청과 확인된 저장 결과를 함께 요구한다.
- Kosmo는 Post와 Profile의 조회 정책을 통과한 Media 접근 결과만 제공한다.
- 구현 이슈와 OpenSpec은 저장 서비스 구현과 Kosmo 통합을 독립적인 전달 단위로 나눌 수 있으며, Kosmo 통합
  검증에서 두 단위의 계약을 함께 확인한다.
- 기존 Kosmo 저장 경로의 전환, 기존 데이터 migration, 실패한 업로드와 orphan 표현 정리의 구체 정책은 각
  구현 이슈와 OpenSpec에서 정밀화한다.

## 문서 반영

- [Media](../objects/media.md)는 Kosmo가 소유하는 논리 Media와 저장 완료 확인, Account/Profile 연결 책임을
  정의한다.
- [File](../objects/file.md)은 내부 저장과 Media Storage Service 양쪽을 허용하는 논리 파일 표현 경계를
  정의한다.
- [Post](../objects/post.md)는 저장 성공이 확인된 Local Media만 Attached Media가 될 수 있음을 정의한다.
