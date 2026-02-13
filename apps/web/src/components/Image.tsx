import { Avatar } from '@base-ui/react';
import { useFragment } from 'react-relay';
import { graphql } from 'relay-runtime';
import { base64 } from 'rfc4648';
import { tv, VariantProps } from 'tailwind-variants';
import { thumbHashToDataURL } from 'thumbhash';
import { Image_File_Fragment$key } from '$relay/Image_File_Fragment.graphql';

const variants = tv({
  slots: {
    root: '',
    image: 'size-full',
  },

  variants: {
    shape: {
      round: {
        root: 'aspect-square rounded-full',
        image: 'rounded-full',
      },
      square: {},
    },
  },

  defaultVariants: {
    shape: 'square',
  },
});

type Props = {
  className?: string;
  file: Image_File_Fragment$key | null | undefined;
  shape?: VariantProps<typeof variants>['shape'];
};

export default function Image({ className, file, shape }: Props) {
  const styles = variants({ shape });
  const data = useFragment(
    graphql`
      fragment Image_File_Fragment on File {
        id
        url
        placeholder
      }
    `,
    file,
  );

  if (data) {
    return (
      <Avatar.Root className={styles.root({ className })}>
        <Avatar.Image className={styles.image()} src={data.url} />
        <Avatar.Fallback>
          <img
            className={styles.image()}
            src={thumbHashToDataURL(base64.parse(data.placeholder ?? ''))}
          />
        </Avatar.Fallback>
      </Avatar.Root>
    );
  } else {
    return null;
  }
}
