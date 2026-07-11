# ADR 0008: Relationship and Report State Exclusions

## 상태

Accepted

## 날짜

2026-06-29

## 결정

- Account-Profile Membership은 별도 lifecycle 상태 차원을 갖지 않는다.
- Account Profile Role은 Owner와 Member 값을 가진다.
- Membership 생성, Role 변경, Owner 지위 양도, 제거 조건은 행동에 정의한다.
- Membership 행동은 관계 권한과 별도로 행동 주체의 `Account.Active`를 요구한다.
- Local Profile에는 Owner Membership이 항상 하나 이상 존재하며 각 행동 조건에서 이를 보장한다.
- 초대 수락 대기와 연결 해제 대기는 현재 Membership 상태로 확장하지 않는다.
- 신고 제출, 신고 묶음, 신고 처리 단계와 관련 durable 객체는 현재 도메인 범위에서 제외한다.

## 문서 반영

- [Account-Profile Membership](../objects/account-profile-membership.md)은 Role과 관계 Mutation만 소유한다.
- 신고 관련 durable 객체와 상태 기계는 객체 인덱스에 두지 않는다.
