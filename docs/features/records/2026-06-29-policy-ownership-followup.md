# 2026-06-29 정책 소유권 후속 결정 기록

## 배경

DDD 도메인 명세에서 `~정한다`처럼 미확정으로 남은 표현, 문서 간 소유권 충돌, 구현/연합 스펙과
도메인 스펙의 혼재를 다시 점검했다. 이번 답변을 기준으로 정책 소유권과 제외 범위를 확정하고
[ADR 0003](../decisions/0003-policy-ownership-clarifications.md)에 장기 결정으로 남겼다.

## 질문별 결정

1. 민감한 미디어 상태는 Post가 가진다. Post가 민감한 미디어로 설정되면 그 Post의 모든 Media 표시가
   가려진다.
2. Content Warning은 Publishing이 소유한다.
3. Post Eligibility는 데이터를 가지는 상태가 아니라 Publishing 정책으로 본다.
4. Post List는 control을 적용하지만 정책 원본은 각 upstream 컨텍스트에 둔다.
5. 변환 실패 미디어는 도메인 정책으로 결정할 이유가 부족하므로 도메인 명세에서 제외한다.
6. 팔로우 승인 정책은 Identity가 소유하고, Follow Request와 Follow Relationship 생명주기는 Social
   Graph가 소유한다.
7. 특정 Profile 새 Post 알림 preference는 Social Graph가 소유하고 Notification이 소비한다.
8. Thread mute는 Notification이 소유한다.
9. 연합 delivery 실패, 원격 서버 전달 실패, 원격 서버 삭제/정지 신호 적용 순서는 구현/연합 스펙으로
   분리한다.
10. 제한 또는 정지된 Account/Profile에서 발생한 소셜 알림은 별도 요청함으로 보내지 않고 노출하지
    않는다. 신고만으로는 노출, 알림, 라우팅 변화가 없다.
11. 로컬 이미지 업로드 제한은 Post당 이미지 최대 4개, 이미지당 최대 10 MiB, MIME type
    `image/avif`, `image/jpeg`, `image/png`, `image/webp`, 가로/세로 각각 최대 4096px로 둔다. Avatar
    표시 crop은 400x400, header image 표시 crop은 1500x500을 기준으로 둔다.
12. Post 수정은 현재 지원하지 않는다.
13. Profile이 남아 있으면 Account를 삭제할 수 없다.
14. Block 발생 시 기존 follow, Reaction, Repost, Bookmark, Notification은 삭제한다.
15. 이미 확정된 용어는 `미결정 네이밍`에 남기지 않고 `확정된 용어`로 옮긴다.

## 문서 반영 원칙

- 확정된 소유권은 각 `contexts/` 문서의 경계, 정책 후보, 도메인 속성에 반영한다.
- 도메인 명세가 아닌 구현/연합 delivery 실패 처리는 제외/보류 범위에 둔다.
- `미결정 네이밍`에는 실제로 결정이 필요한 항목만 남긴다.

## 다음 질문 후보

1. Home Post List의 한국어 제품 표현을 `홈`으로 둘지, 팔로잉 중심 의미를 드러내는 별도 표현을 둘지
   결정할 수 있다.
