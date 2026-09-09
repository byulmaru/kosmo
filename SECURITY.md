# Security Policy

이 문서는 KOSMO 저장소를 변경하거나 검토하는 AI 코딩·보안 도구가 적용할 저장소 보안
정책이다. 시스템 경계, 신뢰 가정, 반드시 유지할 속성, finding 판정 기준과 알려진 제한을
정의한다. 저장소 설정은 운영 상태의 증거가 아니며, 이 문서는 명령 실행이나 외부 상태
변경을 승인하지 않는다.

## 시스템과 범위

정책은 현재 작업 tree와 기준 branch의 다음 구성 요소와 공식 배포 구성을 다룬다.

- Web 클라이언트와 BFF, GraphQL API 및 iOS·Android 클라이언트
- ActivityPub endpoint, Fedify queue·consumer와 Temporal Worker
- Admin Console과 Tailscale ingress
- PostgreSQL 데이터·migration·backup
- Media Storage Service, OIDC, Sentry와 feedback 등 외부 연동
- 빌드, CI, 컨테이너, Helm, Terraform과 release·mobile signing workflow

중요 자산은 Account와 Session, Profile membership, 콘텐츠와 visibility, federation
identity·private key·delivery state, 미디어, 데이터베이스·backup, service credential,
배포·서명 권한, 사용자 데이터와 서비스 가용성이다.

Web·API·native client와 ActivityPub은 외부 입력에 노출된다. Admin Console은 public
surface가 아니라 Tailscale 접근 경계 뒤의 내부 surface다. Dev와 Production은 별도
namespace, Vault path, PostgreSQL cluster와 Temporal namespace를 사용하지만, 저장소
구성만으로 live 격리나 별도 물리 control plane을 증명하지 않는다.

## 위협 모델과 신뢰 경계

다음 입력과 주체는 신뢰하지 않는다.

- 인증되지 않은 Web·GraphQL·OIDC·ActivityPub 요청
- 권한 경계를 넘으려는 인증 사용자와 custom native client
- 올바르게 서명했더라도 악의적이거나 손상된 federation server
- 업로드, remote document·media, 외부 서비스 응답과 저장된 원격 콘텐츠
- dependency, registry, GitHub Action, build tool, runner와 배포 artifact
- 침해된 workload가 같은 환경의 credential·database·service로 이동하는 경로

운영자가 관리하는 설정, secret store, Tailscale policy와 cluster control plane은 현재
아키텍처의 신뢰 가정이다. 그 경계를 통과하는 값은 용도와 형식에 맞게 검증해야 하며,
실제 설정을 확인하지 않고 control이 적용됐다고 가정하지 않는다.

## 보안 불변식

- OIDC issuer·client·redirect, state와 PKCE를 검증한 뒤에만 Kosmo Session을 만든다.
  Session은 ACTIVE Account와 ACTIVE Session에만 권한을 부여하고 logout·revocation을
  우회해서는 안 된다.
- 데이터 조회와 변경 전에 Account–Profile membership, owner 권한, lifecycle과
  visibility 정책을 적용한다. 인증만으로 객체 권한을 대신하지 않는다.
- ActivityPub signature, actor·object attribution, audience, follower 관계와 local/remote
  경계를 검증한다. 서명된 remote input도 안전한 데이터로 간주하지 않는다.
- Admin Console의 유일한 진입 인가는 Tailscale policy와 ingress NetworkPolicy다.
  `Tailscale-User-*` header는 표시 metadata일 뿐 인가나 Account 매핑에 사용하지 않으며,
  public ingress나 일반 workload의 proxy 우회를 허용하지 않는다.
- 사용자·원격 콘텐츠는 실행 가능한 코드가 아닌 데이터로 처리하고 안전한 표현으로
  변환한다.
- Local Media는 인증된 Account·Profile에 결합하고 `UPLOADING`에서 검증된 `READY`
  상태로 전환된 뒤에만 게시한다. 외부 storage 응답은 신뢰하지 않고 schema와 상태를
  검증한다.
- redirect, remote URL과 outbound request가 credential을 유출하거나 private network,
  cloud metadata, cluster·관리 surface로 우회하지 않게 한다.
- secret과 session credential은 server·secure device storage 경계에 유지하고 client
  bundle, telemetry, 로그와 오류 응답에 노출하지 않는다.
- transaction rollback, replay와 retry가 중복 상태 변경이나 delivery를 만들지 않아야
  한다. 외부 side effect는 선언된 commit 경계를 지키고 idempotency를 유지한다.
- 신뢰하지 않는 입력의 크기·복잡도·fan-out과 처리량을 제한해 parsing, query, queue,
  workflow 또는 storage 자원을 고갈시키지 않는다.
- GraphQL의 사용자별 권한은 중앙 application policy가 적용하며 runtime database role은
  non-owner여야 한다. Migration과 Fedify queue의 별도 권한 경계를 유지한다.
- release artifact와 mobile binary는 승인된 source revision·image digest·signing
  workflow에 연결하고 배포 credential은 최소 권한으로 사용한다.

## Finding 판정과 심각도

AI 도구는 현재 source와 실제 caller를 따라 공격자 입력에서 보안 불변식 위반까지의
현실적인 경로를 제시해야 한다. 테스트는 의도와 실패 예시의 근거이지 control이 실제로
동작한다는 증명은 아니다. 운영 설정, 배포 상태와 외부 서비스 control은 현재 근거
없이 확인된 사실로 취급하지 않는다.

Scanner 또는 Dependabot 알림만으로 finding이나 안전성이 확정되지는 않는다. 실제 버전,
공격자 입력, runtime·build·CI 도달 경로와 영향을 확인한다. 개발 의존성이라는 이유만으로
제외하지 않고, 반대로 위험해 보이는 primitive만으로 취약점을 주장하지 않는다.

심각도는 필요한 권한과 사용자 상호작용, 공격 비용, 영향받는 사용자·instance 범위,
기밀성·무결성·가용성 영향, 자동화·지속 가능성과 복구 비용으로 정한다. 다음 결과는
현재 경로가 입증되면 높은 심각도로 본다.

- 계정 탈취, 다른 Account·Profile의 private/direct 데이터 접근 또는 권한 없는 변경
- public runtime code execution, credential·private key·database backup 유출
- federation identity 위조, private network SSRF 또는 durable queue·workflow corruption
- 승인 경계를 우회한 production·signed mobile artifact 배포
- 낮은 비용으로 반복 가능한 데이터 손실 또는 광범위한 서비스 거부

## 범위 밖 항목과 수용 경계

다음 항목만으로는 finding으로 보지 않는다.

- 현재 지원되는 source·배포에 영향을 주지 않는 오래된 revision이나 수정된 포크
- 현실적인 도달 경로와 보안 영향이 없는 이론적 문제
- KOSMO의 설정·credential·연동에 결함이 없는 AWS 등 외부 provider 자체의 문제
- 공식 CI·배포에 영향을 주지 않고 문서와 다르게 외부 노출한 로컬 개발 환경만의 문제
- public analytics key·Sentry DSN, 예상된 public ActivityPub·profile·media 데이터처럼
  원래 공개되는 값 자체

Admin Console v1은 Tailscale와 NetworkPolicy를 application-level 인증 대신 사용하는
all-or-nothing read boundary다. Node·kubelet 권한을 이미 가진 운영 주체는 현재 모델의
신뢰된 infrastructure다. Application 인증이 없다는 사실만으로는 finding이 아니지만,
일반 workload나 public network가 이 경계를 우회하면 finding이다.

여기에 명시되지 않은 위험을 임의로 수용된 위험으로 추론하지 않는다. 새로운 수용 위험은
영향 범위, 근거, 보완 통제, 책임자와 재검토 조건을 함께 기록해야 한다.

## 알려진 제한과 보완 통제

- 장기 로그인 유지는 제품 의도다. 현재 Session에는 server-enforced absolute·idle expiry가
  없고 Web cookie는 장기 유지되며, ACTIVE state와 명시적 logout·revocation이 이를
  보완한다. 이 제한은 영구 불변식이나 일괄 제외 근거가 아니다. Token 탈취·재사용,
  revocation 우회 또는 과도한 blast radius 경로는 여전히 finding이다.
- GraphQL의 viewer별 visibility와 owner 권한은 PostgreSQL RLS가 아니라 중앙 application
  policy가 적용한다. Shared non-owner runtime role과 database constraint가 구조적 경계를
  보완한다. RLS 부재 자체는 finding이 아니지만 application policy 우회는 finding이다.
- KOSMO는 Media 발급·완료의 인증, 소유권, state와 외부 응답 검증을 책임진다. Upload byte
  decoding, type·size·quota, object isolation과 serving header는 이 저장소 밖 storage
  service·provider 책임이며 여기서 control 적용을 주장하지 않는다. AWS 자체 결함은 범위
  밖이지만 KOSMO의 잘못된 grant·permission·configuration과 신뢰 검증은 범위 안이다.
- 저장소에서 GraphQL depth·cost limiter나 distributed request rate limiter가 확인되지
  않는다. 외부 edge control을 추정하지 말고, finding은 재현 가능한 자원 영향과 경로로
  판단한다.
- Semgrep, Trivy, Nuclei와 Dependabot은 검토 신호를 제공하지만 안전성을 증명하거나 개별
  알림의 자동 제외를 정당화하지 않는다.

## 재검토 조건

OIDC·Session 정책, Admin ingress·mutation, Media Storage 계약, 새 ActivityPub activity나
remote fetch, runtime Secret·database role, analytics·telemetry, GraphQL query·rate limit,
GitHub workflow·runner·Environment, release·mobile signing 경계가 바뀌면 이 정책을 현재
source와 live evidence에 맞게 재검토한다.

## 보안 연락처

보안 관련 연락은 공개 Issue나 Pull Request 대신
[hello@byulmaru.co](mailto:hello@byulmaru.co)로 보내며 제목에 `[Security] KOSMO`를 포함한다.
