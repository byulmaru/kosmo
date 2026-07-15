import { z } from 'zod';
import { normalizePostContentPlainText } from '../post-content';
import { postBodyMaxLength } from './post-policy';

export { postBodyMaxLength } from './post-policy';

export const postBodyTextSchema = z
  .string()
  .transform(normalizePostContentPlainText)
  .pipe(
    z
      .string()
      .min(1, { message: '본문을 입력해주세요.' })
      .max(postBodyMaxLength, {
        message: `본문은 ${postBodyMaxLength.toLocaleString('ko-KR')}자까지 작성할 수 있어요.`,
      }),
  );
