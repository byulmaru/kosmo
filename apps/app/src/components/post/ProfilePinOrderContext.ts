import { createContext } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

export type ProfilePinOrderMenu = Readonly<{
  postId: string;
  items: readonly ActionMenuItem[];
  pending: boolean;
}>;

export const ProfilePinOrderContext = createContext<ProfilePinOrderMenu | null>(null);
