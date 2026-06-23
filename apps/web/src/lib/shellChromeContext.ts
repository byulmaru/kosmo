import { getContext, setContext } from 'svelte';

const SHELL_CHROME_KEY = Symbol('shell-chrome');

type ShellChromeContext = {
  // 보호 라우트가 콜드 세션 검증 스플래시로 화면을 덮는 동안 (tabs) 셸(사이드바·모바일 헤더·하단탭·
  // 우측 레일·드로어)을 inert 처리하도록 신호한다. 스플래시는 시각적으로만 덮으므로, 이 신호가 없으면
  // 키보드·스크린리더 사용자가 덮인 셸 메뉴로 포커스를 옮겨 이동·활성화할 수 있다.
  setInert: (inert: boolean) => void;
};

export const setShellChromeContext = (context: ShellChromeContext) =>
  setContext(SHELL_CHROME_KEY, context);

export const getShellChromeContext = () =>
  getContext<ShellChromeContext | undefined>(SHELL_CHROME_KEY);
