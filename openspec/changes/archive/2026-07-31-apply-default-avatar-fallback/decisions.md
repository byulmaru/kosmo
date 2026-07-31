## Context

이 기록은 `docs/design/figma.md`에 확정한 Default Avatar 원본과 PROD-596의 공용 fallback 범위·완료 조건을
구현 전에 대조한 결과다.

## Decision Records

### URL 부재 fallback은 공용 기본 이미지다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/figma.md`, PROD-596
- Status: Active
- Context / Problem: 공용 `Avatar`가 URL 부재 상태를 표시 이름 기반 이니셜로 렌더해 승인된 제품 디자인과
  다르고, 소비 화면마다 같은 fallback이 필요하다.
- Decision Outcome: 실제 프로필 이미지 URL이 없을 때 공용 `Avatar`는 승인된 기본 이미지를 표시한다. URL이
  있으면 실제 이미지를 우선하고 접근 가능한 이름은 기존 프로필 표시 이름을 유지한다.
- Alternatives Considered: 이니셜 fallback 유지, 소비 화면별 기본 이미지 전달. 전자는 승인된 제품 계약과
  다르고 후자는 공용 fallback의 일관성을 보장하지 못한다.
- Consequences: 게시글·프로필·알림·검색 등 공용 primitive 소비자는 별도 fallback 로직 없이 같은 이미지를
  사용한다. 네트워크 이미지 로드 실패 전환은 포함하지 않는다.
- Confirmation / Follow-up: URL 유무의 우선순위를 단위 테스트로 확인하고 주요 크기와 주변 배경을
  Storybook에서 검증한다.

### 전체 Figma 노드를 단일 1024×1024 PNG로 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/figma.md`, PROD-596
- Status: Active
- Context / Problem: Figma 원본은 배경 frame과 crop된 내부 vector를 함께 사용하므로 내부 SVG만 번들링하면
  승인된 시각 결과를 재현하지 못한다.
- Decision Outcome: Figma `Default Avatar` 노드(1552:667)의 전체 프레임을 export한 단일 1024×1024 PNG를
  구현 에셋으로 사용한다.
- Alternatives Considered: 내부 SVG 직접 import, 크기별 PNG variant. SVG는 배경·crop을 잃고 현재 앱의
  transformer 지원도 없으며, 크기별 variant는 추가 동기화 비용에 비해 이점이 없다.
- Consequences: Expo Native와 Web의 기존 정적 PNG 경로를 재사용하고 새 dependency나 Metro transformer를
  추가하지 않는다. 모든 크기는 같은 고해상도 원본을 축소해 표시한다.
- Confirmation / Follow-up: export의 1024×1024 정방형 규격과 작은 크기의 식별성·clipping을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
