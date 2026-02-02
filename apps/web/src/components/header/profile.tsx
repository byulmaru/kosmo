import { graphql, useFragment } from 'react-relay';
import { profile_ComponentsHeader_Profile_Fragment$key } from '@/relay/profile_ComponentsHeader_Profile_Fragment.graphql';
import Header from '.';

type Props = {
  profile: profile_ComponentsHeader_Profile_Fragment$key;
};

export default function ProfileHeader({ profile }: Props) {
  const data = useFragment(
    graphql`
      fragment profile_ComponentsHeader_Profile_Fragment on Profile {
        id
        displayName
        handle
      }
    `,
    profile,
  );

  return (
    <Header backButton={true}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <div className="font-bold">{data.displayName}</div>
          <div className="text-muted-foreground">@{data.handle}</div>
        </div>
      </div>
    </Header>
  );
}
