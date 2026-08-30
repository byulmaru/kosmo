import { z } from 'zod';

export const profileHandlePolicyErrorMessage = '사용할 수 없는 단어가 포함된 핸들이에요.';
export const profileHandlePolicyValidationReason = 'PROFILE_HANDLE_POLICY';

export const systemReservedProfileHandleValues = [
  'abuse',
  'adm',
  'admin',
  'admins',
  'administration',
  'administrator',
  'administrators',
  'moderator',
  'moderators',
  'official',
  'operator',
  'owner',
  'owners',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'api',
  'auth',
  'authentication',
  'contact',
  'contactus',
  'copyright',
  'dmca',
  'help',
  'hostmaster',
  'legal',
  'login',
  'logout',
  'oauth',
  'policies',
  'policy',
  'postmaster',
  'privacy',
  'register',
  'registration',
  'report',
  'reports',
  'status',
  'terms',
  'tos',
  'webmaster',
  'activitypub',
  'actor',
  'actors',
  'ap',
  'byulmaru',
  'federation',
  'fediverse',
  'graphql',
  'health',
  'inbox',
  'kosmo',
  'nodeinfo',
  'outbox',
  'webfinger',
  // Current top-level static app route segments that are valid Local handles.
  'bookmarks',
  'compose',
  'feedback',
  'hashtags',
  'home',
  'local',
  'notifications',
  'search',
  'settings',
  'kosmo_admin',
  'kosmo_moderator',
  'kosmo_official',
  'kosmo_security',
  'kosmo_support',
] as const;

export const explicitlyHarmfulProfileHandleValues = [
  'fuck',
  'slut',
  'porn',
  'p0rn',
  'pr0n',
  'xxx',
  'chink',
  'chinks',
  'coon',
  'coons',
  'nigg',
  'niggs',
  'nigga',
  'niggas',
  'nigger',
  'niggers',
  'nigglet',
  'nigglets',
  'fag',
  'fags',
  'fagg',
  'faggs',
  'faggot',
  'faggots',
  'faggotry',
  'faggotries',
  'kike',
  'kikes',
  'kyke',
  'kykes',
  'tranny',
  'trannys',
  'trannie',
  'trannies',
] as const;

const systemReservedProfileHandleSet = new Set<string>(systemReservedProfileHandleValues);
const explicitlyHarmfulProfileHandleSet = new Set<string>(explicitlyHarmfulProfileHandleValues);

export type ProfileHandlePolicyViolation = 'system-reserved' | 'explicitly-harmful';

export function profileHandlePolicyViolation(
  value: string,
): ProfileHandlePolicyViolation | undefined {
  const normalized = value.trim().toLowerCase();

  if (systemReservedProfileHandleSet.has(normalized)) {
    return 'system-reserved';
  }

  const compact = normalized.replaceAll('_', '');
  const substituted = compact.replace(/[0134]/g, (character) => {
    switch (character) {
      case '0':
        return 'o';
      case '1':
        return 'i';
      case '3':
        return 'e';
      case '4':
        return 'a';
      default:
        return character;
    }
  });

  if (
    explicitlyHarmfulProfileHandleSet.has(compact) ||
    explicitlyHarmfulProfileHandleSet.has(substituted)
  ) {
    return 'explicitly-harmful';
  }

  return undefined;
}

export const profileHandleSchema = z
  .string()
  .trim()
  .min(3, '핸들은 3자 이상 입력해주세요.')
  .max(30, '핸들은 30자 이하로 입력해주세요.')
  .regex(/^[a-zA-Z0-9_]+$/, '핸들은 영문, 숫자, 밑줄(_)만 사용할 수 있어요.');

const localProfileHandlePolicySchema = z
  .string()
  .trim()
  .superRefine((handle, context) => {
    if (profileHandlePolicyViolation(handle)) {
      context.addIssue({
        code: 'custom',
        message: profileHandlePolicyErrorMessage,
        params: { reason: profileHandlePolicyValidationReason },
      });
    }
  });

export const localProfileHandleSchema = localProfileHandlePolicySchema.pipe(profileHandleSchema);

export const profileDisplayNameSchema = z.string().trim().min(1).max(80);

export const profileBioSchema = z.string().trim().max(500).nullable();
