import { parseMediaUseTermsRights } from '@kosmo/core/media-metadata';
import { Hono } from 'hono';

const imageUseTermsRoutes = new Hono();

imageUseTermsRoutes.on(['GET', 'HEAD'], '/terms/image-use/v1', async (c, next) => {
  if (!parseMediaUseTermsRights(c.req.queries())) {
    return c.text('유효하지 않은 이미지 이용 조건입니다.', 400);
  }

  await next();
});

export default imageUseTermsRoutes;
