import { ProfileRelationshipState } from '@kosmo/enum';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Button } from '@/components/ui/button';
import { FollowButton_Profile_Fragment$key } from '$relay/FollowButton_Profile_Fragment.graphql';

type Props = {
  profile: FollowButton_Profile_Fragment$key;
  className?: string;
  useEditProfile?: boolean;
};

export default function FollowButton({ profile, className, useEditProfile = false }: Props) {
  const { t } = useTranslation('profile');
  const data = useFragment(
    graphql`
      fragment FollowButton_Profile_Fragment on Profile {
        id
        followerCount
        isMe

        relationship {
          to
          from
        }
      }
    `,
    profile,
  );

  const [commitFollowProfile] = useMutation(graphql`
    mutation FollowButton_followProfile_Mutation($input: FollowProfileInput!) {
      followProfile(input: $input) {
        __typename

        ... on FollowProfileSuccess {
          profile {
            id
            followerCount
            relationship {
              to
            }
          }
        }
      }
    }
  `);

  const [commitUnfollowProfile] = useMutation(graphql`
    mutation FollowButton_unfollowProfile_Mutation($input: UnfollowProfileInput!) {
      unfollowProfile(input: $input) {
        __typename

        ... on UnfollowProfileSuccess {
          profile {
            id
            followerCount
            relationship {
              to
            }
          }
        }
      }
    }
  `);

  const followProfile = () => {
    commitFollowProfile({
      variables: { input: { profileId: data.id } },
      optimisticResponse: {
        followProfile: {
          __typename: 'FollowProfileSuccess',
          profile: {
            id: data.id,
            followerCount: data.followerCount + 1,
            relationship: {
              to: ProfileRelationshipState.FOLLOW,
            },
          },
        },
      },
    });
  };

  const unfollowProfile = () => {
    commitUnfollowProfile({
      variables: { input: { profileId: data.id } },
      optimisticResponse: {
        unfollowProfile: {
          __typename: 'UnfollowProfileSuccess',
          profile: {
            id: data.id,
            followerCount: data.followerCount - 1,
            relationship: {
              to: null,
            },
          },
        },
      },
    });
  };

  if (data.isMe) {
    return useEditProfile ? (
      <Button variant="outline" className={className}>
        {t('button.edit')}
      </Button>
    ) : null;
  }

  if (data.relationship?.to === ProfileRelationshipState.FOLLOW) {
    return (
      <Button
        variant="outline"
        className={`hover:bg-destructive hover:border-destructive dark:hover:bg-destructive/60 group hover:text-white ${className}`}
        onClick={unfollowProfile}
      >
        <span className="group-hover:hidden">{t('button.following')}</span>
        <span className="hidden group-hover:inline">{t('button.unfollow')}</span>
      </Button>
    );
  }

  return (
    <Button className={className} onClick={followProfile}>
      {t('button.follow')}
    </Button>
  );
}
