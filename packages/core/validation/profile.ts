import { z } from 'zod';

export const profileHandleSchema = z
  .string()
  .trim()
  .min(3, '핸들은 3자 이상 입력해주세요.')
  .max(30, '핸들은 30자 이하로 입력해주세요.')
  .regex(/^[a-zA-Z0-9_]+$/, '핸들은 영문, 숫자, 밑줄(_)만 사용할 수 있어요.');

export const profileDisplayNameSchema = z.string().trim().min(1).max(80);

export const profileBioSchema = z.string().trim().max(500).nullable();
