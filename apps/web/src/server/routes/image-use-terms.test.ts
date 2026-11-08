import { MEDIA_USE_ATTRIBUTION_REQUIREMENT } from '@kosmo/core/media-metadata';
import { beforeAll, expect, test } from 'vitest';
import type { Hono } from 'hono';

let routes: Hono;

beforeAll(async () => {
  ({ default: routes } = await import('./image-use-terms'));
});

test('renders the selected permission for each scope with required terms', async () => {
  const response = await routes.request(
    '/terms/image-use/v1?personal=EDIT&noncommercial=ORIGINAL&commercial=DENY',
  );
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(permissionCard(body, 'personal')).toContain('수정 가능');
  expect(permissionCard(body, 'noncommercial')).toContain('무수정 사용');
  expect(permissionCard(body, 'commercial')).toContain('사용 금지');
  expect(body).not.toMatch(/\b(?:DENY|ORIGINAL|EDIT)\b/);
  expect(body).toContain('전체 크기 조정, 형식 변경, 압축을 허용합니다.');
  expect(body).toContain('자르기나 이미지 내용 변경에는 수정 가능 허용이 필요합니다.');
  expect(body).toContain(MEDIA_USE_ATTRIBUTION_REQUIREMENT);
  expect(body).not.toContain('원본 게시글 링크');
  expect(body).toContain('AI 모델 학습 목적의 이용은 선택한 조건과 관계없이 허용되지 않습니다.');
});

test.each([
  '',
  '?personal=UNKNOWN&noncommercial=DENY&commercial=DENY',
  '?personal=DENY&noncommercial=DENY&commercial=EDIT',
  '?personal=DENY&personal=ORIGINAL&noncommercial=DENY&commercial=DENY',
  '?personal=DENY&noncommercial=DENY&commercial=DENY&username=alice',
])('rejects invalid or ambiguous terms parameters %s', async (query) => {
  const response = await routes.request(`/terms/image-use/v1${query}`);

  expect(response.status).toBe(400);
});

test('serves HEAD for a valid terms URL without a body', async () => {
  const response = await routes.request(
    '/terms/image-use/v1?personal=DENY&noncommercial=DENY&commercial=DENY',
    { method: 'HEAD' },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(await response.text()).toBe('');
});

function permissionCard(body: string, scope: string): string {
  const match = body.match(
    new RegExp(
      `<section class="permission" aria-labelledby="${scope}-title">([\\s\\S]*?)<\\/section>`,
    ),
  );
  if (!match?.[1]) {
    throw new Error(`Image-use terms missing ${scope} permission.`);
  }
  return match[1];
}
