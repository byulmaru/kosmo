import { sessionName } from '@kosmo/core';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies }) => {
  // 로그인 사용자(세션 쿠키 보유)는 홈으로 보내고, 비로그인 사용자에게만 루트 온보딩을 보여준다.
  // 세션 유효성 검증은 API와 보호 라우트 처리(PROD-148)가 담당하며, 여기서는 apps/web의
  // 기존 패턴(graphql/+server.ts)과 동일하게 세션 쿠키 존재 여부로 분기한다.
  if (cookies.get(sessionName)) {
    redirect(307, '/home');
  }

  return {};
};
