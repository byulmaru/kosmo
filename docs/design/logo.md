# 로고 사용 기준

## 확정 자산

- 풀 로고 라이트: 의도한 비율의 투명한 `1665×1050` 캔버스를 유지한다.
- 브랜드 마크 라이트: 투명 배경의 단독 마크다.
- 앱 아이콘 라이트: `1024×1024`, 배경은 `#FEFEFE`다. iOS와 Apple touch icon, 일반 PWA icon에 사용한다.
- 브라우저 favicon: 투명 배경의 K+별 전용 마크를 사용한다. `16–32px` 탭 식별성을 우선하며 앱 아이콘과 자산을 공유하지 않는다.
- Android foreground: `1024×1024` 투명 PNG다. Figma에서 확정한 optical offset을 그대로 유지하고 `#FEFEFE` adaptive-icon background와 조합한다.
- 다크 앱 아이콘과 Android monochrome/themed icon은 소비처와 시안이 확정되지 않아 사용하지 않는다.

## 여백과 최소 크기

- 풀 로고의 clear space는 로고 K 내부의 작은 별 한 변을 `1x`로 보고, 사방에 최소 `1x`를 둔다. 마스터 기준 약 `48px`다.
- 풀 로고는 디지털에서 너비 `160px` 이상을 권장한다. 제한된 앱 헤더처럼 더 작은 소비처에서는 레이아웃을 깨지 않는 범위에서 축소하되 비율을 바꾸지 않는다.
- 앱 아이콘과 favicon은 라운드 모서리를 자산에 직접 굽지 않는다. 운영체제나 브라우저 마스크가 모양을 결정한다.
- Android foreground의 마크 위치를 다시 중앙 정렬하지 않는다. 현재 offset이 optical center다.

## 저장소 소비처

- 앱 내 로딩 화면은 투명 브랜드 마크를 사용한다.
- 로그인 화면 헤더는 풀 로고를 사용한다.
- 브라우저 favicon은 K+별 전용 마크를 사용한다.
- iOS, Apple touch icon과 일반 PWA icon은 `#FEFEFE` 배경의 라이트 앱 아이콘을 사용한다.
- Android adaptive icon과 maskable PWA icon은 투명 foreground와 `#FEFEFE` 배경을 조합한다.
- 기본 공유 이미지는 `1200×630` `#FEFEFE` 배경에 풀 로고만 중앙 배치한다. `og:url`,
  `og:image`, `twitter:image`의 절대 URL은 Web BFF가 배포별 `PUBLIC_ORIGIN`을 기준으로
  SPA shell 응답에 주입한다.

컬러 변수와 코드 컬러 토큰의 재정비는 별도 작업이다. 이 문서는 로고 자산의 현재 색을 기존 `primary` 토큰에 재매핑하는 근거가 아니다.
