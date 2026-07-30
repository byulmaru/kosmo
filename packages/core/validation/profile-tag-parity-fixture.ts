export const profileTagNormalizationParityCases = [
  { label: 'NFKC', input: '  #Ｆｏｏ  ', displayName: 'Foo', normalized: 'foo' },
  {
    label: 'locale-independent lowercase sharp s',
    input: 'Straße',
    displayName: 'Straße',
    normalized: 'straße',
  },
  { label: 'Greek sigma', input: 'ΟΣ', displayName: 'ΟΣ', normalized: 'ος' },
  {
    label: 'astral 20 code points',
    input: '𐐀'.repeat(20),
    displayName: '𐐀'.repeat(20),
    normalized: '𐐨'.repeat(20),
  },
] as const;

export const profileTagDuplicateParityCases = [
  { label: 'sharp s', existing: 'STRAẞE', input: 'Straße' },
  { label: 'Greek sigma', existing: 'ος', input: 'ΟΣ' },
  { label: 'NFKC', existing: 'foo', input: '#Ｆｏｏ' },
] as const;

export const profileTagInvalidParityCases = [
  { label: 'astral 21 code points', input: '𐐀'.repeat(21) },
] as const;
