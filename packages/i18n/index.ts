import en from './en.json';
import ko from './ko.json';

interface LanguageData {
  [key: string]: LanguageData | string;
}

export const LANGUAGE_LIST = ['en-US', 'ko-KR'] as const;
export type LANGUAGE_LIST = (typeof LANGUAGE_LIST)[number];

const languages: Record<string, LanguageData> = {
  'en-US': en,
  'ko-KR': ko,
} satisfies Record<LANGUAGE_LIST, LanguageData>;

export const getLanguagesByAcceptLanguageHeader = (header: string | null | undefined) => {
  const languages =
    (header
      ?.split(',')
      .map((lang: string) => lang.split(';', 1)[0].trim())
      .filter((lang) => LANGUAGE_LIST.includes(lang as LANGUAGE_LIST)) as LANGUAGE_LIST[]) ?? [];

  if (!languages.includes('en-US')) {
    languages.push('en-US');
  }
  if (!languages.includes('ko-KR')) {
    languages.push('ko-KR');
  }

  return languages;
};

type GetStringArgs = {
  locales: readonly string[];
  key: string;
  args?: Record<string, string>;
};

export const getString = ({ locales, key, args }: GetStringArgs) => {
  for (const locale of locales) {
    const currentLanguage = languages[locale];
    if (!currentLanguage) {
      continue;
    }

    const keys = key.split('.');
    let value: LanguageData | string | null = currentLanguage;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = null;
        break;
      }
    }

    if (typeof value === 'string') {
      return parseString({ str: value, args });
    }
  }

  return key;
};

type ParseStringArgs = {
  str: string;
  args?: Record<string, string>;
};

const parseString = ({ str, args }: ParseStringArgs) => {
  const compiledTemplate = compileTemplate(str);

  return compiledTemplate.reduce((acc, part) => {
    if (part.type === 'string') {
      return acc + part.value;
    }

    if (part.type === 'expression') {
      const value = args?.[part.variable] ?? '';
      // TODO: 함수 실행
      return acc + value;
    }

    return acc;
  }, '');
};

type TemplatePart =
  | {
      type: 'string';
      value: string;
    }
  | {
      type: 'expression';
      variable: string;
      functions: {
        name: string;
        args: string[];
      }[];
    };

const compileTemplate = (template: string): TemplatePart[] => {
  const parts: TemplatePart[] = [];
  const regex = /\\([{}])|(?:{([^{}]+?)})/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const textBefore = template.slice(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: 'string', value: textBefore });
    }

    if (match[1]) {
      parts.push({ type: 'string', value: match[1] });
    } else if (match[2]) {
      const [variable, ...functionStrings] = match[2].split('|');
      parts.push({
        type: 'expression',
        variable: variable.trim(),
        functions: functionStrings.map((functionString) => {
          const [, name, argString] = functionString.match(/(\w+)\s*(?:\((.+)\))?/) ?? [];
          const args = argString?.split(',') ?? [];
          return { name, args };
        }),
      });
    }

    lastIndex = regex.lastIndex;
  }

  const textAfter = template.slice(lastIndex);
  if (textAfter) {
    parts.push({ type: 'string', value: textAfter });
  }

  return parts;
};
