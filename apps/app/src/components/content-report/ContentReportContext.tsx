import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ContentReportOverlay } from './ContentReportOverlay';
import type { ContentReportTargetType } from '@kosmo/core/enums';
import type { PropsWithChildren } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

export type ContentReportTarget = Readonly<{
  id: string;
  kind: ContentReportTargetType;
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

export function useContentReportMenuItem(target: ContentReportTarget): ActionMenuItem {
  const { openContentReport } = useContentReport();
  const label = target.kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';
  const onSelect = useCallback(() => openContentReport(target), [openContentReport, target]);

  return useMemo(
    () => ({
      accessibilityLabel: label,
      key: `report-${target.kind.toLowerCase()}`,
      label: '신고',
      onSelect,
      tone: 'danger' as const,
    }),
    [label, onSelect, target.kind],
  );
}
