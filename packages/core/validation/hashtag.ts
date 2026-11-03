export const normalizeHashtag = (value: string) => {
  const displayName = value.trim().replace(/^#/u, '').normalize('NFKC');
  return { displayName, name: displayName.toLowerCase() };
};
