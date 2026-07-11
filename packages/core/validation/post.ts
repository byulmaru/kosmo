import { z } from 'zod';
import { postBodyMaxLength } from './post-policy';

export { postBodyMaxLength } from './post-policy';

export const postBodyTextSchema = z
  .string()
  .trim()
  .min(1, { message: '본문을 입력해주세요.' })
  .max(postBodyMaxLength, {
    message: `본문은 ${postBodyMaxLength.toLocaleString('ko-KR')}자까지 작성할 수 있어요.`,
  });
