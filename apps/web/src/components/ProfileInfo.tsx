import { Link } from '@tanstack/react-router';
import { graphql, useFragment } from 'react-relay';
import { tv, VariantProps } from 'tailwind-variants';
import { ProfileInfo_Profile_Fragment$key } from '@/relay/ProfileInfo_Profile_Fragment.graphql';
import Avatar, { ProfileAvatarSkeleton } from './Avatar';
import { Skeleton } from './ui/skeleton';

export const profileInfoVariants = tv({
  slots: {
    root: 'group flex items-center shrink',
    avatar: '',
    text: 'truncate min-w-0 shrink text-start',
    displayName: 'truncate',
    handle: 'text-muted-foreground truncate shrink',
  },
  variants: {
    size: {
      default: {
        root: 'gap-2',
        avatar: 'size-10',
        displayName: 'text-sm font-semibold',
        handle: 'text-xs',
      },
      lg: {
        root: 'gap-3',
        avatar: 'size-12',
        displayName: 'text-lg font-bold',
        handle: 'text-sm',
      },
      compact: {
        root: 'gap-1',
        avatar: 'size-8',
        displayName: 'text-xs font-semibold',
        handle: 'text-xs',
      },
    },
    link: {
      true: {
        displayName: 'group-hover:underline',
        handle: 'group-hover:underline',
      },
    },
    canCollapse: {
      true: {
        root: 'justify-center lg:justify-start',
        text: 'hidden lg:block',
      },
    },
  },
  defaultVariants: {
    size: 'default',
    link: false,
    canCollapse: false,
  },
});

type Props = {
  canCollapse?: boolean;
  className?: string;
  link?: boolean;
  profile: ProfileInfo_Profile_Fragment$key;
  size?: VariantProps<typeof profileInfoVariants>['size'];
};

export default function ProfileInfo({ profile, className, size, link, canCollapse }: Props) {
  const styles = profileInfoVariants({ size, link, canCollapse });
  const data = useFragment(
    graphql`
      fragment ProfileInfo_Profile_Fragment on Profile {
        id
        displayName
        fullHandle
        relativeHandle

        avatar {
          id

          ...Avatar_File_Fragment
        }
      }
    `,
    profile,
  );

  const ProfileInfoContent = (
    <>
      <Avatar className={styles.avatar()} file={data.avatar} />
      <div className={styles.text()}>
        <div className={styles.displayName()}>{data.displayName}</div>
        <div className={styles.handle()}>@{data.fullHandle}</div>
      </div>
    </>
  );

  return link ? (
    <Link
      className={styles.root({ className })}
      to="/@{$handle}"
      params={{ handle: data.relativeHandle }}
    >
      {ProfileInfoContent}
    </Link>
  ) : (
    <div className={styles.root({ className })}>{ProfileInfoContent}</div>
  );
}

export function ProfileInfoSkeleton({
  className,
  size,
  canCollapse,
}: Pick<Props, 'canCollapse' | 'className' | 'size'>) {
  const styles = profileInfoVariants({ size, canCollapse });

  return (
    <div className={styles.root({ className })}>
      <ProfileAvatarSkeleton className={styles.avatar()} />
      <div className={styles.text()}>
        <Skeleton className={styles.displayName({ className: 'w-4' })} />
        <Skeleton className={styles.handle({ className: 'w-12' })} />
      </div>
    </div>
  );
}
