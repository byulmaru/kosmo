import { createFileRoute } from '@tanstack/react-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import ProfilePost from '@/pages/ProfilePost';
import { Handle_MainIndex_Query } from '$relay/Handle_MainIndex_Query.graphql';

export const Route = createFileRoute('/_main/@{$handle}/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { handle } = Route.useParams();
  const data = useLazyLoadQuery<Handle_MainIndex_Query>(
    graphql`
      query Handle_MainIndex_Query($handle: String!) {
        profile(handle: $handle) {
          id

          ...ProfilePost_Profile_Fragment
        }
      }
    `,
    { handle },
  );

  return data.profile && <ProfilePost profile={data.profile} />;
}
