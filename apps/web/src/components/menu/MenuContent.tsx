import { HouseIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment } from 'react-relay';
import { match } from 'ts-pattern';
import { MenuContent_Fragment$key } from '@/relay/MenuContent_Fragment.graphql';
import ProfileDropdown from '../ProfileDropdown';
import MenuButton from './button';

type Props = {
  kind: 'sidebar' | 'page';
  query: MenuContent_Fragment$key;
};
export default function MenuContent({ kind, query }: Props) {
  const { t } = useTranslation('menu');
  const data = useFragment(
    graphql`
      fragment MenuContent_Fragment on Query {
        usingProfile {
          id
          relativeHandle

          ...ProfileDropdown_Profile_Fragment
        }
      }
    `,
    query,
  );

  return match(kind)
    .with('sidebar', () => (
      <>
        <MenuButton href="/" Icon={HouseIcon} canCollapse={true}>
          {t('content.home')}
        </MenuButton>
        {data.usingProfile && (
          <>
            <MenuButton
              href={`/@${data.usingProfile?.relativeHandle}`}
              Icon={UserIcon}
              canCollapse={true}
            >
              {t('content.profile')}
            </MenuButton>
            <div className="flex-1"></div>
            <ProfileDropdown profile={data.usingProfile} canCollapse={true} />
          </>
        )}
      </>
    ))
    .with('page', () => (
      <>
        {data.usingProfile && <ProfileDropdown profile={data.usingProfile} canCollapse={false} />}
      </>
    ))
    .exhaustive();
}
