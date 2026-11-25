import { createContext, useContext } from 'react';
import type { ComponentType, PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type PostMediaViewerSession = Readonly<{
  mediaOwnerPostId: string;
  onDeleted?: () => void;
  originControl: RefObject<NativeView | null>;
  selectedIndex: number;
  surfacePostId: string;
}>;

export type PostMediaViewerHostComponent = ComponentType<PropsWithChildren>;

type OpenViewer = (session: PostMediaViewerSession) => void;

export const PostMediaViewerHostContext = createContext<OpenViewer | null>(null);

export function usePostMediaViewerHost(): OpenViewer {
  const openViewer = useContext(PostMediaViewerHostContext);
  if (!openViewer) {
    throw new Error('Post Media Viewer launcher에는 PostMediaViewerHostProvider가 필요합니다.');
  }
  return openViewer;
}
