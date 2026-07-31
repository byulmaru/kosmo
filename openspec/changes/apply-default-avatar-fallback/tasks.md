## 1. PROD-596 공용 기본 아바타 적용

**Authority / Provenance**

- `docs/design/figma.md`
- `PROD-596`

**Deliverable**

프로필 이미지 URL이 없는 사용자는 공용 Avatar 소비 화면에서 승인된 같은 기본 이미지를 보고, 실제 이미지
URL이 있는 사용자는 기존 이미지를 계속 본다.

**Guardrails**

- Figma `Default Avatar` 전체 노드에서 export한 단일 1024×1024 PNG를 사용한다.
- 실제 프로필 이미지 URL을 기본 이미지보다 우선한다.
- 원형 clipping, 크기 조절과 기존 프로필 표시 이름 기반 접근 가능한 이름을 유지한다.
- 실제 이미지 연결, 업로드·삭제와 네트워크 이미지 로드 실패 정책은 변경하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 ProfileHero 단위 테스트에서 URL 부재 시 기본 asset, URL 존재 시 원격 URI 우선순위를
  직접 검증한다.
- 테스트 필요성: 이전 “URL 부재 시 Image 없음” 계약을 기본 이미지 계약으로 바꾸고 실제 이미지 우선순위
  회귀를 막는다.
- 테스트 제외 범위: 소비 화면별 중복 snapshot, 네트워크 실패 조합, 새 fixture·helper·harness와 테스트 인프라
  변경은 포함하지 않는다.
- Storybook에서 24/32/40/48/64px, 원형 clipping과 라이트·다크 주변 배경의 표시 품질을 확인한다.
- `@kosmo/app` unit test, Storybook test/build와 check를 통과시킨다. iOS·Android runtime QA를 실행하지 못하면
  자동화 결과와 구분해 남긴다.

- [ ] 1.1 승인된 기본 아바타 PNG를 앱 정적 asset으로 추가한다.
- [ ] 1.2 공용 Avatar의 URL 부재 fallback을 기본 이미지로 교체하고 Guardrails를 유지한다.
- [ ] 1.3 근접 단위 테스트와 Storybook 상태를 새 fallback 계약에 맞춘다.
- [ ] 1.4 관련 자동화와 크기·배경별 시각 검증을 수행하고 실행하지 못한 runtime QA를 기록한다.
- [ ] 1.5 최신 canonical specs와 관련 active delta를 대조한 뒤 전체 change의 완료·archive 조건을 확인한다.
