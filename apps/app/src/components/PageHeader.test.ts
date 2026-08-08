import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(new URL('./BrandLogo.tsx', import.meta.url), { BrandLogo: 'BrandLogo' });
mockModule(new URL('../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ background: '#ffffff', border: '#dddddd', text: '#111111' }),
});

type PageHeaderProps =
  | { leading?: ReactNode; title: string; variant?: 'text' }
  | { accessibilityLabel: string; leading?: ReactNode; variant: 'brand' };
type TestElementProps = {
  'aria-hidden'?: boolean;
  accessibilityElementsHidden?: boolean;
  accessibilityRole?: string;
  children?: ReactNode;
  numberOfLines?: number;
  style?: unknown;
  variant?: string;
  width?: number;
};
type TestElement = ReactElement<TestElementProps>;
type PageHeaderComponent = (props: PageHeaderProps) => TestElement;

let PageHeader: PageHeaderComponent | undefined;

before(async () => {
  const module = await import('./PageHeader').catch(() => null);
  PageHeader = module?.PageHeader as PageHeaderComponent | undefined;
});

function renderHeader(props: PageHeaderProps) {
  assert.ok(PageHeader, 'PageHeader component must exist');
  return PageHeader(props);
}

function findElements(node: ReactNode, type: string): TestElement[] {
  if (!node || typeof node !== 'object' || !('type' in node)) {
    return [];
  }

  const element = node as TestElement;
  const matches = element.type === type ? [element] : [];
  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];

  return [...matches, ...children.flatMap((child) => findElements(child, type))];
}

test('text variant exposes one visible heading in a 64px page bar', () => {
  const header = renderHeader({ title: '알림' });
  const headings = findElements(header, 'Text').filter(
    (element) => element.props.accessibilityRole === 'header',
  );

  assert.equal(header.type, 'View');
  assert.equal((header.props.style as Array<{ minHeight?: number }>)[0]?.minHeight, 64);
  assert.equal(headings.length, 1);
  assert.equal(headings[0]?.props.children, '알림');
});

test('text title shrinks and wraps within the available width beside a leading action', () => {
  const leading = createElement('Pressable', { accessibilityLabel: '뒤로 가기' });
  const header = renderHeader({ leading, title: '게시물 기본 공개 범위' });
  const heading = findElements(header, 'Text').find(
    (element) => element.props.accessibilityRole === 'header',
  );

  assert.ok(heading);
  const titleStyle = (heading.props.style as Array<Record<string, unknown>>)[0];
  assert.equal(titleStyle?.flexShrink, 1);
  assert.equal(titleStyle?.minWidth, 0);
  assert.equal(heading.props.numberOfLines, undefined);
});

test('brand variant exposes one Home heading and hides the approved mark from accessibility', () => {
  const leading = createElement('Pressable', { accessibilityLabel: '메뉴 열기' });
  const header = renderHeader({ accessibilityLabel: '홈', leading, variant: 'brand' });
  const headings = findElements(header, 'Text').filter(
    (element) => element.props.accessibilityRole === 'header',
  );
  const logos = findElements(header, 'BrandLogo');
  const hiddenLogoWrappers = findElements(header, 'View').filter(
    (element) => element.props['aria-hidden'] === true,
  );

  assert.equal(headings.length, 1);
  assert.equal(headings[0]?.props.children, '홈');
  assert.equal(logos.length, 1);
  assert.equal(logos[0]?.props.variant, 'mark');
  assert.equal(logos[0]?.props.width, 38);
  assert.equal(hiddenLogoWrappers.length, 1);
  assert.equal(hiddenLogoWrappers[0]?.props.accessibilityElementsHidden, true);
  assert.equal(findElements(header, 'Pressable').length, 1);
});
