import { graphql, useFragment } from 'react-relay';
import { cn } from 'tailwind-variants';
import { Avatar_File_Fragment$key } from '$relay/Avatar_File_Fragment.graphql';
import Image from './Image';
import { Skeleton } from './ui/skeleton';

type Props = {
  className?: string;
  file: Avatar_File_Fragment$key;
};

export default function ProfileAvatar({ className, file }: Props) {
  const data = useFragment(
    graphql`
      fragment Avatar_File_Fragment on File {
        ...Image_File_Fragment
      }
    `,
    file,
  );

  return <Image className={className} file={data} shape="round" />;
}

export function ProfileAvatarSkeleton({ className }: Pick<Props, 'className'>) {
  return <Skeleton className={cn('shrink-0 rounded-full', className)} />;
}
