import { Menu } from '@base-ui/react/menu';
import { ChevronsUpDownIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment, useLazyLoadQuery } from 'react-relay';
import { cn } from 'tailwind-variants';
import { ProfileDropdown_Profile_Fragment$key } from '@/relay/ProfileDropdown_Profile_Fragment.graphql';
import { ProfileDropdownContent_components_Query } from '@/relay/ProfileDropdownContent_components_Query.graphql';
import ProfileInfo, { ProfileInfoSkeleton } from './ProfileInfo';

type Props = {
  canCollapse?: boolean;
  profile: ProfileDropdown_Profile_Fragment$key;
};

export default function ProfileDropdown({ canCollapse, profile }: Props) {
  const { t } = useTranslation('menu');
  const data = useFragment(
    graphql`
      fragment ProfileDropdown_Profile_Fragment on Profile {
        ...ProfileInfo_Profile_Fragment
      }
    `,
    profile,
  );

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          'hover:bg-muted flex w-full flex-row items-center justify-center p-2',
          canCollapse ? 'justify-center lg:justify-start' : 'justify-start',
        )}
      >
        <span className="sr-only">{t('content.selectProfile')}</span>
        <ProfileInfo canCollapse={canCollapse} profile={data} className="flex-1" />
        <ChevronsUpDownIcon className={cn('size-4', canCollapse ? 'hidden lg:block' : 'block')} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-100">
          <Menu.Popup className="bg-background w-60 border">
            <Suspense fallback={ProfileDropdownContentFallback()}>
              <ProfileDropdownContent />
            </Suspense>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ProfileDropdownContent() {
  const data = useLazyLoadQuery<ProfileDropdownContent_components_Query>(
    graphql`
      query ProfileDropdownContent_components_Query {
        me {
          profiles {
            id

            ...ProfileInfo_Profile_Fragment
          }
        }

        usingProfile {
          id
        }
      }
    `,
    {},
  );

  return data.me ? (
    data.me.profiles.map((profile) => (
      <Menu.Item key={profile.id} className="p-2">
        <ProfileInfo profile={profile} size="compact" />
      </Menu.Item>
    ))
  ) : (
    <Menu.Item className="p-2">프로필이 없어요</Menu.Item>
  );
}

function ProfileDropdownContentFallback() {
  return (
    <Menu.Item className="p-2">
      <ProfileInfoSkeleton size="compact" />
    </Menu.Item>
  );
}
