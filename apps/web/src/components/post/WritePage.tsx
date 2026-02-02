import { PostVisibility } from '@kosmo/enum';
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment } from 'react-relay';
import { WritePage_Query_Fragment$key } from '@/relay/WritePage_Query_Fragment.graphql';
import ProfileInfo from '../ProfileInfo';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown';
import PostVisibilityIcon from './PostVisibilityIcon';
import TiptapEditor from './TiptapEditor';

const POST_VISIBILITY = [
  PostVisibility.PUBLIC,
  PostVisibility.UNLISTED,
  PostVisibility.FOLLOWER,
  PostVisibility.DIRECT,
] satisfies PostVisibility[];

type Props = {
  query: WritePage_Query_Fragment$key;
};

export default function WritePage({ query }: Props) {
  const { t } = useTranslation('post');
  const data = useFragment(
    graphql`
      fragment WritePage_Query_Fragment on Query {
        usingProfile {
          id

          config {
            defaultPostVisibility
          }

          ...ProfileInfo_Profile_Fragment
        }
      }
    `,
    query,
  );

  const [visibility, setVisibility] = useState<PostVisibility>(
    data.usingProfile?.config?.defaultPostVisibility ?? PostVisibility.UNLISTED,
  );

  if (!data.usingProfile) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <ProfileInfo link={true} profile={data.usingProfile} />
      <div className="flex flex-col gap-2 border p-2">
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex gap-1" render={<Button variant="outline" />}>
              <PostVisibilityIcon visibility={visibility} />
              <span>{t(`visibility.${visibility}.title`)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60 gap-1">
              {POST_VISIBILITY.map((visibility) => (
                <DropdownMenuItem
                  className="flex-col items-start gap-0"
                  key={visibility}
                  onClick={() => setVisibility(visibility)}
                >
                  <div className="flex items-center gap-1">
                    <PostVisibilityIcon visibility={visibility} />
                    <span>{t(`visibility.${visibility}.title`)}</span>
                  </div>
                  <div>{t(`visibility.${visibility}.description`)}</div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <TiptapEditor className="h-full min-h-24" onUpdate={(content) => console.log(content)} />
        <div className="flex">
          <Button variant="ghost" size="icon">
            <ImageIcon />
          </Button>
          <div className="flex-1"></div>
          <Button>{t('write.submit')}</Button>
        </div>
      </div>
    </div>
  );
}
