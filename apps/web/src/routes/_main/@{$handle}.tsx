import { createFileRoute, Outlet } from '@tanstack/react-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import Avatar from '@/components/Avatar';
import FollowButton from '@/components/FollowButton';
import ProfileHeader from '@/components/header/profile';
import Image from '@/components/Image';
import { Handle_Main_Query } from '@/relay/Handle_Main_Query.graphql';

export const Route = createFileRoute('/_main/@{$handle}')({
  component: ProfileLayout,
});

// Hardcoded enum (same as in FollowButton)
const ProfileRelationshipState = {
  FOLLOW: 'FOLLOW',
  BLOCK: 'BLOCK',
  MUTE: 'MUTE',
} as const;

function ProfileLayout() {
  const { handle } = Route.useParams();

  const data = useLazyLoadQuery<Handle_Main_Query>(
    graphql`
      query Handle_Main_Query($handle: String!) {
        profile(handle: $handle) {
          id
          displayName
          handle
          description
          followerCount
          followingCount
          isMe

          avatar {
            ...Avatar_File_Fragment
          }

          header {
            ...Image_File_Fragment
          }

          relationship {
            to
            from
          }

          ...FollowButton_Profile_Fragment
          ...profile_ComponentsHeader_Profile_Fragment
        }
      }
    `,
    { handle },
  );

  const profile = data.profile;

  if (!profile) {
    return <div className="text-muted-foreground p-8 text-center">Profile not found.</div>;
  }

  return (
    <>
      <ProfileHeader profile={profile} />
      <div className="bg-card text-card-foreground w-full border-b">
        <div className="aspect-3/1 bg-muted w-full">
          <Image className="size-full" file={profile.header} />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between">
            <Avatar
              className="border-background lg:-mt-22 -mt-16 size-24 border-4 sm:-mt-20 sm:size-32 lg:size-36"
              file={profile.avatar}
            />
            <div className="flex flex-col items-end gap-2">
              {profile.relationship?.from === ProfileRelationshipState.FOLLOW && (
                <div className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs font-medium">
                  Follows you
                </div>
              )}
              <FollowButton profile={profile} useEditProfile={true} />
            </div>
          </div>

          <div className="my-2">
            <div className="text-xl font-bold">{profile.displayName}</div>
            <div className="text-muted-foreground">@{profile.handle}</div>
          </div>

          <div className="my-2 whitespace-pre-wrap">
            <p>{profile.description}</p>
          </div>

          {/* <div className="my-2 flex gap-4 text-sm">
            <Link
              className="flex gap-1 hover:underline"
              href={`/@${profile.handle}/following`}
            >
              <span className="font-semibold">{profile.followingCount.toLocaleString()}</span>
              <span className="text-muted-foreground">Following</span>
            </Link>
            <Link
              className="flex gap-1 hover:underline"
              href={`/@${profile.handle}/followers`}
            >
              <span className="font-semibold">{profile.followerCount.toLocaleString()}</span>
              <span className="text-muted-foreground">Followers</span>
            </Link>
          </div> */}
        </div>
      </div>
      <Outlet />
    </>
  );
}
