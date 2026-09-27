import type { ReactNode } from 'react';

export function ProfileBioPrivacyBoundary({ children }: { children?: ReactNode }) {
  return (
    <div
      className="ph-mask ph-no-capture"
      data-testid="profile-bio-privacy"
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  );
}
