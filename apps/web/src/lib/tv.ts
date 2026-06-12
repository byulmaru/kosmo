import { createTV } from 'tailwind-variants';

// layout.css `@theme`의 커스텀 토큰을 tailwind-merge에 등록한 공용 tv.
// 등록하지 않으면 tailwind-merge가 `text-text-secondary`(색상)와 `text-xsm`(폰트
// 크기)을 같은 그룹으로 오판해, 같은 슬롯에서 나중 클래스가 앞의 색상 클래스를
// 제거한다. 토큰 목록은 layout.css `@theme`와 함께 맞춘다.
export const tv = createTV({
  twMergeConfig: {
    extend: {
      theme: {
        text: ['xsm', 'md'],
        color: [
          'bg',
          'surface',
          'card',
          'text-primary',
          'text-secondary',
          'border',
          'primary',
          'danger',
          'like',
          'more',
        ],
      },
    },
  },
});
