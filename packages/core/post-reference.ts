import { decodeGlobalId } from './global-id';

const postSlugPattern = /^[A-Za-z0-9]{12}$/;

type PostReference = { readonly slug: string } | { readonly id: string };

export const parsePostReference = (reference: string): PostReference | null => {
  if (postSlugPattern.test(reference)) {
    return { slug: reference };
  }

  try {
    const { id, typename } = decodeGlobalId(reference);
    return typename === 'Post' ? { id } : null;
  } catch {
    return null;
  }
};
