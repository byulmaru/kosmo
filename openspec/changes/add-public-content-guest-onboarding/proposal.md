## Why

비로그인 공개 콘텐츠의 셸이 인증 사용자 메뉴를 보여줘 현재 상태와 다음 행동을 오해하게 만든다.

## Goal

PROD-836의 공개 Profile·Post 방문자 안내와 인증 후 복귀 흐름을 조사·설계하고 구현 handoff를 남긴다.

## What Changes

모든 Web 폭에 닫을 수 있는 하단 CTA를 제공하고 full Web 우측 레일의 중복 가입하기·로그인 버튼과 별도의 가입·소개 안내 카드는 제거한다. 좌측에는 `가입하기`·`로그인` 버튼을 남기고, 하단에는 `KOSMO에서 계속하기` 버튼과 `팀 별마루 소개`·`개인정보처리방침` 링크를 배치한다. mobile Web은 헤더 왼쪽 햄버거 버튼으로 drawer에 접근한다. Profile 준비 후 공개 콘텐츠 복귀를 연결한다.

## Non-Goals

이번 세션의 제품 구현·테스트·배포, Native 신규 온보딩, 인증 수단 추가, 공개 조회 제한, 전체 핵심 기능 학습.

## Constraints

공개 조회와 기존 인증 권한을 유지하고 currentSession으로 상태를 구분한다. 이전 Profile 초기화를 유지하며 참여 행동을 자동 실행하지 않는다.

## Verification

문서 계약·구조와 OpenSpec strict validation을 확인한다. 실제 행동 검증은 다음 구현 세션에서 수행한다.

## Business Context

- Product canonical: `docs/domain/policies/public-content-onboarding.md`, `docs/domain/objects/session.md`, `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`, ADR 0019.
- Visual design source: `docs/design/public-content-onboarding.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`.
- Linear: PROD-836, PROD-681.
- User agreement: 2026-10-14 Question 답변 네 건과 2026-10-16 사용자 지시. 배치·닫기·Profile 준비 후 복귀·보호 메뉴 숨김 및 사이드바 버튼·하단 안내 구성. 2026-10-16 사용자가 우측 안내 카드를 제외한 나머지 구성을 최종 스펙으로 확정했다.

## Session Status

- Status: Active
- Last updated: 2026-10-16
