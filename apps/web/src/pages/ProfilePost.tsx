import { graphql, usePaginationFragment } from 'react-relay';
import PostContent from '@/components/post/PostContent';
import { ProfilePost_Profile_Fragment$key } from '@/relay/ProfilePost_Profile_Fragment.graphql';

type Props = {
  profile: ProfilePost_Profile_Fragment$key;
};

export default function ProfilePost({ profile }: Props) {
  const { data } = usePaginationFragment(
    graphql`
      fragment ProfilePost_Profile_Fragment on Profile
      @argumentDefinitions(cursor: { type: "String" }, count: { type: "Int", defaultValue: 10 })
      @refetchable(queryName: "ProfilePost_Profile_Fragment_RefetchQuery") {
        posts(first: $count, after: $cursor) @connection(key: "ProfilePost_posts") {
          edges {
            node {
              id

              ...PostContent_Post_Fragment
            }
          }
        }
      }
    `,
    profile,
  );

  return (
    <>
      {data.posts?.edges.map((edge) => (
        <PostContent key={edge.node.id} post={edge.node} />
      ))}
    </>
  );
}
