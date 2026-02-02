import { PostVisibility } from '@kosmo/enum';
import { nodes } from '@kosmo/tiptap';
import { ClientOnly } from '@tanstack/react-router';
import { Tiptap, useEditor, useTiptap, useTiptapState } from '@tiptap/react';
import { ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Keymap } from '@/lib/tiptap/extensions/keymap';
import { Placeholder } from '@/lib/tiptap/extensions/placeholder';
import { WritePage_CreatePostMutation } from '@/relay/WritePage_CreatePostMutation.graphql';
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
import type { FormEvent } from 'react';

const POST_CONTENT_LIMIT = 500;
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

  const editor = useEditor({
    extensions: [
      ...nodes,
      Placeholder.configure({
        placeholder: t('write.placeholder'),
      }),
      Keymap,
    ],

    immediatelyRender: false,
    content: '',

    editorProps: {
      attributes: {
        class: 'touch-pan-y outline-none h-full min-h-24',
      },
    },
  });

  const [visibility, setVisibility] = useState<PostVisibility>(
    data.usingProfile?.config?.defaultPostVisibility ?? PostVisibility.UNLISTED,
  );

  const [commitCreatePostMutation, createPostMutationInFlight] =
    useMutation<WritePage_CreatePostMutation>(graphql`
      mutation WritePage_CreatePostMutation($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename

          ... on CreatePostSuccess {
            post {
              id
            }
          }
        }
      }
    `);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editor || editor.state.doc.textContent.trim().length === 0) {
      return;
    }

    commitCreatePostMutation({
      variables: {
        input: {
          content: editor?.getJSON(),
          visibility: visibility,
        },
      },
      onCompleted: (response) => {
        if (response.createPost.__typename === 'CreatePostSuccess') {
          editor?.commands.clearContent();
          setVisibility(
            data.usingProfile?.config?.defaultPostVisibility ?? PostVisibility.UNLISTED,
          );
        }
      },
    });
  };

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editable: !createPostMutationInFlight,
      });
    }
  }, [createPostMutationInFlight]);

  if (!data.usingProfile) {
    return null;
  }

  return (
    <ClientOnly>
      <div className="flex flex-col gap-4">
        <ProfileInfo link={true} profile={data.usingProfile} />
        <form className="flex flex-col gap-2 border p-2" onSubmit={handleSubmit}>
          <Tiptap instance={editor}>
            <div className="flex">
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
                      <div className="text-muted-foreground text-xs">
                        {t(`visibility.${visibility}.description`)}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Tiptap.Content className="min-h-24" />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <ImageIcon />
              </Button>
              <div className="flex-1"></div>
              <PostContentLimitIndicator />
              <Button type="submit" disabled={createPostMutationInFlight}>
                {t('write.submit')}
              </Button>
            </div>
          </Tiptap>
        </form>
      </div>
    </ClientOnly>
  );
}

function PostContentLimitIndicator() {
  const { isReady } = useTiptap();
  const count = useTiptapState(
    (state) => POST_CONTENT_LIMIT - state.editor.state.doc.textContent.length,
  );

  return isReady && <span className="text-muted-foreground select-none text-sm">{count}</span>;
}
