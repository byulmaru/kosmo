import { expect, userEvent, waitFor, within } from 'storybook/test';
import { colors } from '@/theme/tokens';

type Point = { x: number; y: number };

export async function pressActionBarPoint(container: HTMLElement, point: Point, end?: Point) {
  const document = container.ownerDocument;
  const coords = ({ x, y }: Point) => ({
    clientX: x,
    clientY: y,
    pageX: x + window.scrollX,
    pageY: y + window.scrollY,
  });
  const target = document.elementFromPoint(point.x, point.y)!;
  expect(target).not.toBeNull();
  const release = end ?? point;
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target, coords: coords(point) },
    ...(end ? [{ target: document.elementFromPoint(end.x, end.y)!, coords: coords(end) }] : []),
    {
      keys: '[/MouseLeft]',
      target: document.elementFromPoint(release.x, release.y)!,
      coords: coords(release),
    },
  ]);
}

export function actionBarWhitespace(container: HTMLElement) {
  const scope = within(container);
  const toolbar = scope.getByRole('toolbar', { name: '액션 바' });
  toolbar.scrollIntoView({ block: 'center' });
  const bounds = toolbar.getBoundingClientRect();
  const frame = toolbar.parentElement!.getBoundingClientRect();
  const slot = (name: string) =>
    scope.getByTestId(`post-action-${name}-slot`).getBoundingClientRect();
  const repost = slot('repost');
  const reaction = slot('reaction');
  const bookmark = slot('bookmark');
  const more = slot('more');
  const y = (bounds.top + bounds.bottom) / 2;
  return [
    { x: (repost.right + reaction.left) / 2, y: frame.top + 2 },
    { x: (repost.right + reaction.left) / 2, y },
    { x: reaction.left + 1, y },
    { x: (bookmark.right + more.left) / 2, y },
  ];
}

export async function checkActionBarWhitespace(
  container: HTMLElement,
  assertNavigation: () => void,
) {
  for (let index = 0; index < 4; index += 1) {
    const point = actionBarWhitespace(container)[index]!;
    const target = container.ownerDocument.elementFromPoint(point.x, point.y)!;
    expect(container.contains(target)).toBe(true);
    expect(target.closest('[role="button"]')).toBeNull();
    expect(getComputedStyle(target).cursor).toBe('pointer');
    await pressActionBarPoint(container, point);
    assertNavigation();
  }
}

export async function checkActionBarCancelledPresses(
  container: HTMLElement,
  assertUnchanged: () => void,
) {
  const point = actionBarWhitespace(container)[1]!;
  await pressActionBarPoint(container, point, { x: point.x + 30, y: point.y });
  assertUnchanged();
  const toolbar = within(container)
    .getByRole('toolbar', { name: '액션 바' })
    .getBoundingClientRect();
  // Leave the host by less than the drag threshold, so bounds cancellation is also exercised.
  const edge = { x: point.x, y: toolbar.top + 1 };
  await pressActionBarPoint(container, edge, { x: edge.x, y: toolbar.top - 1 });
  assertUnchanged();
}

export async function checkActionBarScrollCancelledPress(
  container: HTMLElement,
  assertUnchanged: () => void,
) {
  const point = actionBarWhitespace(container)[1]!;
  const target = container.ownerDocument.elementFromPoint(point.x, point.y)!;
  const scope = within(container);
  expect(target).toBe(scope.getByRole('toolbar', { name: '액션 바' }));
  const feedback = scope.getByTestId('post-list-item-feedback');
  const pointerUser = userEvent.setup({ document: container.ownerDocument });
  const scrollY = window.scrollY;
  expect(document.documentElement.scrollHeight - window.innerHeight).toBeGreaterThan(scrollY + 30);
  const coords = {
    clientX: point.x,
    clientY: point.y,
    pageX: point.x + window.scrollX,
    pageY: point.y + scrollY,
  };
  await pointerUser.pointer({ keys: '[MouseLeft>]', target, coords });
  await waitFor(() =>
    expect(feedback).toHaveStyle({ backgroundColor: colors.light.statePressedSubtle }),
  );
  const pressedColor = getComputedStyle(feedback).backgroundColor;
  const scrolled = new Promise<void>((resolve) =>
    window.addEventListener('scroll', () => resolve(), { once: true }),
  );
  window.scrollBy(0, 30);
  await scrolled;
  expect(window.scrollY).toBeGreaterThan(scrollY);
  await waitFor(() => expect(getComputedStyle(feedback).backgroundColor).not.toBe(pressedColor));
  // Preserve the host and page position so only the scroll can cancel this press.
  await pointerUser.pointer({
    keys: '[/MouseLeft]',
    target,
    coords: { ...coords, clientY: point.y - (window.scrollY - scrollY) },
  });
  assertUnchanged();
}
