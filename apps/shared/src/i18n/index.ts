import ko_KR from '../../i18n/ko_KR.json';

interface LanguageData {
  [key: string]: LanguageData | string;
}

const languages: Record<string, LanguageData> = {
  'ko-KR': ko_KR,
};

type GetStringArgs = {
  locales: string[];
  key: string;
  args?: Record<string, string>;
};

export const getString = ({ locales, key, args }: GetStringArgs) => {
  for (const locale of [...locales]) {
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
      return value;
    }
  }

  return key;
};

type ParseStringArgs = {
  str: string;
  args?: Record<string, string>;
};

export const parseString = ({ str, args }: ParseStringArgs) => {
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

export const compileTemplate = (template: string): TemplatePart[] => {
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
          const [_, name, argString] = functionString.match(/(\w+)\s*(?:\((.+)\))?/) ?? [];
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
