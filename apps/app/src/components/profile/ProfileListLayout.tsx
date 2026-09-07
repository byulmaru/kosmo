import { graphql, useLazyLoadQuery } from 'react-relay';
import { InfiniteList } from '@/components/pagination/InfiniteList';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';
import type {
  InfiniteListRenderer,
  InfiniteListRenderProps,
} from '@/components/pagination/InfiniteList';
import type { ProfileListLayoutQuery as ProfileListLayoutQueryType } from './__generated__/ProfileListLayoutQuery.graphql';

const ProfileListLayoutQuery = graphql`
  query ProfileListLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      instance {
        kind
      }
      viewerState {
        isSelf
        membership {
          role
        }
      }
      ...ProfileHero_profile
      ...FollowButton_profile
    }
  }
`;

type ProfileListLayoutProps = Readonly<{
  children: (renderList: InfiniteListRenderer) => ReactElement;
  handle: string;
}>;

export function ProfileListLayout({ children, handle }: ProfileListLayoutProps) {
  return (
    <RouteBoundary
      key={handle}
      loading={<ProfileHero loading />}
      title="프로필을 불러오지 못했어요"
    >
      <ProfileListLayoutContent handle={handle}>{children}</ProfileListLayoutContent>
    </RouteBoundary>
  );
}

function ProfileListLayoutContent({ children, handle }: ProfileListLayoutProps) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileListLayoutQueryType>(
    ProfileListLayoutQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;

  if (!profile) {
    return (
      <StateView
        description={`@${handle} 프로필이 존재하지 않아요.`}
        title="프로필을 찾을 수 없어요"
      />
    );
  }

  const canEdit =
    profile.instance.kind === 'LOCAL' &&
    profile.viewerState?.isSelf === true &&
    profile.viewerState.membership?.role === 'OWNER';
  const action = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : (
    <FollowButton profile={profile} />
  );

  return children(createListRenderer(<ProfileHero action={action} profile={profile} />));
}

function createListRenderer(profileHeader: ReactElement | null): InfiniteListRenderer {
  return <Item,>({ listHeader, listIdentityKey, ...props }: InfiniteListRenderProps<Item>) => (
    <InfiniteList
      {...props}
      header={
        <>
          {profileHeader}
          {listHeader}
        </>
      }
      key={listIdentityKey}
    />
  );
}
