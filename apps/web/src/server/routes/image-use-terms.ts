import {
  isValidMediaPublicationRights,
  MEDIA_USE_ATTRIBUTION_REQUIREMENT,
  MEDIA_USE_ORIGINAL_DESCRIPTION,
  MEDIA_USE_PERMISSION_DESCRIPTIONS,
  MEDIA_USE_PERMISSION_LABELS,
  MEDIA_USE_SCOPE_DESCRIPTIONS,
  MediaUsePermission,
} from '@kosmo/core/media-metadata';
import { Hono } from 'hono';
import { html } from 'hono/html';
import type { MediaPublicationRights } from '@kosmo/core/media-metadata';

const scopes = ['personal', 'noncommercial', 'commercial'] as const;

const scopeTitles = {
  commercial: '상업적 이용',
  noncommercial: '비상업적 이용',
  personal: '개인적 이용',
} as const;

const imageUseTermsRoutes = new Hono();

imageUseTermsRoutes.on(['GET', 'HEAD'], '/terms/image-use/v1', (c) => {
  const rights = parseRights(new URL(c.req.url));
  if (!rights) {
    return c.text('유효하지 않은 이미지 이용 조건입니다.', 400);
  }

  const headers = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'text/html; charset=UTF-8',
  };
  return c.req.method === 'HEAD'
    ? c.body(null, 200, headers)
    : c.html(renderTerms(rights), 200, headers);
});

function parseRights(url: URL): MediaPublicationRights | null {
  const parameters = url.searchParams;
  if (parameters.size !== scopes.length) {
    return null;
  }

  const entries = scopes.map((scope) => [scope, parameters.getAll(scope)] as const);
  if (entries.some(([, values]) => values.length !== 1)) {
    return null;
  }

  const values = Object.fromEntries(entries.map(([scope, [value]]) => [scope, value]));
  if (
    !Object.values(MediaUsePermission).includes(values.personal as MediaUsePermission) ||
    !Object.values(MediaUsePermission).includes(values.noncommercial as MediaUsePermission) ||
    !Object.values(MediaUsePermission).includes(values.commercial as MediaUsePermission)
  ) {
    return null;
  }

  const rights = {
    personal: values.personal as MediaUsePermission,
    noncommercial: values.noncommercial as MediaUsePermission,
    commercial: values.commercial as MediaUsePermission,
  };
  return isValidMediaPublicationRights(rights) ? rights : null;
}

function renderTerms(rights: MediaPublicationRights) {
  const permissionCards = scopes.map((scope) => {
    const permission = rights[scope];

    return html`
      <section class="permission" aria-labelledby="${scope}-title">
        <h2 id="${scope}-title">${scopeTitles[scope]}</h2>
        <p>${MEDIA_USE_SCOPE_DESCRIPTIONS[scope]}</p>
        <p class="selected"><strong>${MEDIA_USE_PERMISSION_LABELS[permission]}</strong></p>
      </section>
    `;
  });
  const permissionDefinitions = [
    MediaUsePermission.DENY,
    MediaUsePermission.ORIGINAL,
    MediaUsePermission.EDIT,
  ].map(
    (permission) => html`
      <li>
        <strong>${MEDIA_USE_PERMISSION_LABELS[permission]}</strong>
        <span>${MEDIA_USE_PERMISSION_DESCRIPTIONS[permission]}</span>
      </li>
    `,
  );

  return html`
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="KOSMO에서 선택한 이미지 이용 조건과 표시 기준입니다." />
        <title>KOSMO 이미지 이용 조건 v1</title>
        <style>
          :root {
            color-scheme: light dark;
            font-family: 'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif;
            line-height: 1.5;
          }
          body {
            margin: 0;
            background: Canvas;
            color: CanvasText;
          }
          main {
            box-sizing: border-box;
            width: min(100%, 888px);
            margin: 0 auto;
            padding: 32px 24px;
          }
          a {
            color: LinkText;
          }
          .back {
            display: inline-flex;
            min-height: 48px;
            align-items: center;
            margin-bottom: 24px;
          }
          h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 800;
            line-height: 40px;
          }
          h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            line-height: 1.3;
          }
          p {
            margin: 0;
            font-size: 16px;
            line-height: 1.5;
          }
          .permissions {
            display: grid;
            gap: 16px;
            margin-top: 32px;
          }
          .permission,
          .note {
            display: grid;
            gap: 12px;
            padding: 24px;
            border: 1px solid GrayText;
            border-radius: 12px;
          }
          .selected {
            font-size: 18px;
          }
          .definitions {
            display: grid;
            gap: 12px;
            margin: 0;
            padding-left: 24px;
          }
          .definitions li {
            display: grid;
            gap: 4px;
          }
          .notes {
            display: grid;
            gap: 24px;
            margin-top: 32px;
          }
        </style>
      </head>
      <body>
        <main>
          <a class="back" href="/">KOSMO로 돌아가기</a>
          <h1>KOSMO 이미지 이용 조건 v1</h1>
          <div class="permissions">${permissionCards}</div>
          <div class="notes">
            <section class="note" aria-labelledby="attribution-title">
              <h2 id="attribution-title">출처 표시</h2>
              <p>${MEDIA_USE_ATTRIBUTION_REQUIREMENT}</p>
            </section>
            <section class="note" aria-labelledby="permission-title">
              <h2 id="permission-title">이용 수준 안내</h2>
              <ul class="definitions">
                ${permissionDefinitions}
              </ul>
            </section>
            <section class="note" aria-labelledby="reuse-title">
              <h2 id="reuse-title">이미지 변경</h2>
              <p>${MEDIA_USE_ORIGINAL_DESCRIPTION}</p>
            </section>
            <section class="note" aria-labelledby="ai-title">
              <h2 id="ai-title">AI 학습</h2>
              <p>AI 모델 학습 목적의 이용은 선택한 조건과 관계없이 허용되지 않습니다.</p>
            </section>
          </div>
        </main>
      </body>
    </html>
  `;
}

export default imageUseTermsRoutes;
