import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request, cookies }) => {
  let cookieLanguagesString = cookies.get('languages');
  if (cookieLanguagesString) {
    try {
      return { languages: cookieLanguagesString.split(',') };
    } catch {
      // pass
    }
  }

  const acceptLanguage = request.headers.get('Accept-Language');
  const languages = acceptLanguage?.split(',').map((lang: string) => lang.split(';')[0].trim()) ?? [
    'ko-KR',
  ];

  cookies.set('languages', languages.join(','), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return { languages };
};
