import { Flag } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ContentReportOverlay } from './ContentReportOverlay';
import type { ContentReportTargetType } from '@kosmo/core/enums';
import type { PropsWithChildren } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ContentReportOverlay_blockProfile$key } from './__generated__/ContentReportOverlay_blockProfile.graphql';

export type ContentReportTarget = Readonly<{
  blockProfile?: ContentReportOverlay_blockProfile$key;
  id: string;
  kind: ContentReportTargetType;
  label: string;
}>;

type ContentReportBlockProfile = ContentReportOverlay_blockProfile$key &
  Readonly<{
    viewerState?: Readonly<{
      blockedBy?: boolean | null;
      isSelf: boolean;
      profileBlock?: Readonly<{ id: string }> | null;
    }> | null;
  }>;

export function getContentReportBlockProfile(
  profile: ContentReportBlockProfile | null | undefined,
): ContentReportOverlay_blockProfile$key | undefined {
  const viewerState = profile?.viewerState;
  if (
    !profile ||
    !viewerState ||
    viewerState.isSelf ||
    viewerState.blockedBy ||
    viewerState.profileBlock
  ) {
    return undefined;
  }

  return profile;
}

type ContentReportContextValue = Readonly<{
  openContentReport: (target: ContentReportTarget) => void;
}>;

const ContentReportContext = createContext<ContentReportContextValue>({
  openContentReport: () => undefined,
});

export function ContentReportProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<ContentReportTarget | null>(null);
  const [visible, setVisible] = useState(false);
  const openContentReport = useCallback((nextTarget: ContentReportTarget) => {
    setTarget(nextTarget);
    setVisible(true);
  }, []);
  const closeContentReport = useCallback(() => {
    setVisible(false);
  }, []);
  const dismissContentReport = useCallback(() => {
    setTarget(null);
  }, []);
  const value = useMemo(() => ({ openContentReport }), [openContentReport]);

  return (
    <ContentReportContext.Provider value={value}>
      {children}
      <ContentReportOverlay
        onDismiss={dismissContentReport}
        onRequestClose={closeContentReport}
        target={target}
        visible={visible}
      />
    </ContentReportContext.Provider>
  );
}

export function useContentReport() {
  return useContext(ContentReportContext);
}

export function useContentReportMenuItem({
  blockProfile,
  id,
  kind,
  label,
}: ContentReportTarget): ActionMenuItem {
  const { openContentReport } = useContentReport();
  const accessibilityLabel = kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';

  return {
    accessibilityLabel,
    icon: Flag,
    key: `report-${kind.toLowerCase()}`,
    label: '신고',
    onSelect: () => openContentReport({ blockProfile, id, kind, label }),
    tone: 'danger',
  };
}
