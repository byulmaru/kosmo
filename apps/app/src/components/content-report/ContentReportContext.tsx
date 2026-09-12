import { Flag } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ContentReportOverlay } from './ContentReportOverlay';
import type { ContentReportTargetType } from '@kosmo/core/enums';
import type { PropsWithChildren } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

export type ContentReportTarget = Readonly<{
  id: string;
  kind: ContentReportTargetType;
  label: string;
}>;

type ContentReportContextValue = Readonly<{
  openContentReport: (target: ContentReportTarget) => void;
}>;

const ContentReportContext = createContext<ContentReportContextValue>({
  openContentReport: () => undefined,
});

export function ContentReportProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<ContentReportTarget | null>(null);
  const openContentReport = useCallback((nextTarget: ContentReportTarget) => {
    setTarget(nextTarget);
  }, []);
  const closeContentReport = useCallback(() => {
    setTarget(null);
  }, []);
  const value = useMemo(() => ({ openContentReport }), [openContentReport]);

  return (
    <ContentReportContext.Provider value={value}>
      {children}
      <ContentReportOverlay
        onRequestClose={closeContentReport}
        target={target}
        visible={target !== null}
      />
    </ContentReportContext.Provider>
  );
}

export function useContentReport() {
  return useContext(ContentReportContext);
}

export function useContentReportMenuItem({ id, kind, label }: ContentReportTarget): ActionMenuItem {
  const { openContentReport } = useContentReport();
  const accessibilityLabel = kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';

  return {
    accessibilityLabel,
    icon: Flag,
    key: `report-${kind.toLowerCase()}`,
    label: '신고',
    onSelect: () => openContentReport({ id, kind, label }),
    tone: 'danger',
  };
}
