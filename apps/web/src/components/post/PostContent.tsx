import { Link } from '@tanstack/react-router';
import { graphql, useFragment } from 'react-relay';
import { PostContent_Post_Fragment$key } from '$relay/PostContent_Post_Fragment.graphql';
import ProfileInfo from '../ProfileInfo';
import RelativeTime from '../temporal/RelativeTime';
import PostVisibilityIcon from './PostVisibilityIcon';
import TiptapRenderer from './TiptapRenderer';

type Props = {
  post: PostContent_Post_Fragment$key;
};

export default function PostContent({ post }: Props) {
  const fragment = useFragment(
    graphql`
      fragment PostContent_Post_Fragment on Post {
        id
        visibility
        createdAt

        snapshot {
          content
        }

        author {
          id
          displayName
          relativeHandle

          ...ProfileInfo_Profile_Fragment
        }
      }
    `,
    post,
  );

  return (
    <div className="flex flex-col gap-2 border-b p-2">
      <div className="flex items-start justify-between gap-2">
        <ProfileInfo profile={fragment.author} link={true} />
        <Link
          to="/@{$handle}"
          params={{ handle: fragment.author.relativeHandle }}
          className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
        >
          <PostVisibilityIcon className="size-4" visibility={fragment.visibility} />
          <RelativeTime dateStr={fragment.createdAt} />
        </Link>
      </div>
      <TiptapRenderer content={fragment.snapshot?.content} />
    </div>
  );
}
