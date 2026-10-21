import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PostComposerMediaControls as PostComposerMediaControlsComponent,
  PostComposerMediaControlsRenderProps,
  PostComposerMediaValue,
} from './PostComposerMediaControls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type IssueMediaResponse = {
  issueMediaUploadUrl: { media: { id: string }; uploadUrl: string };
};
type CompleteMediaResponse = {
  completeMediaUpload: { media: { id: string; state: string } };
};
type MediaMutationConfig = {
  readonly variables: {
    readonly input: { readonly actorProfileId?: string; readonly id?: string };
  };
  readonly onCompleted: (
    response: IssueMediaResponse | CompleteMediaResponse,
    errors?: ReadonlyArray<unknown> | null,
  ) => void;
  readonly onError: (error: Error) => void;
};
type UploadOptions = {
  readonly asset: ImagePickerAsset;
  readonly complete?: (mediaId: string) => Promise<void>;
  readonly isActive: () => boolean;
  readonly issue: () => Promise<{ readonly mediaId: string; readonly uploadUrl: string }>;
};

const platform = { OS: 'web' };
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let pickerResult: { readonly assets: readonly ImagePickerAsset[]; readonly canceled: boolean } = {
  assets: [],
  canceled: false,
};
let uploadImageImpl: (options: UploadOptions) => Promise<string | null>;
let mediaValues: PostComposerMediaValue[] = [];
let captureMediaValues = true;
let mediaRenderProps: PostComposerMediaControlsRenderProps | undefined;
let issueCalls: MediaMutationConfig[] = [];
let completeCalls: MediaMutationConfig[] = [];
let toastCalls: Array<[string, { tone: string }]> = [];
let renderer: ReactTestRenderer | null = null;
let nextIssuedId = 0;
let PostComposerMediaControls: typeof PostComposerMediaControlsComponent;

const asset = (): ImagePickerAsset =>
  ({ height: 100, uri: 'file:///local/image.jpg', width: 100 }) as ImagePickerAsset;

mockModule('expo-image-picker', {
  launchImageLibraryAsync: async () => pickerResult,
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), {
  ImagePlusIcon: 'ImagePlusIcon',
  RefreshCwIcon: 'RefreshCwIcon',
  XIcon: 'XIcon',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: (document: string) => [
    (config: MediaMutationConfig) => {
      if (document.includes('IssueMediaUploadUrlMutation')) {
        issueCalls.push(config);
        const id = `media-${++nextIssuedId}`;
        config.onCompleted({
          issueMediaUploadUrl: { media: { id }, uploadUrl: `https://upload.example/${id}` },
        });
      } else {
        completeCalls.push(config);
      }
    },
  ],
});
mockModule('@/components/media/imageUpload', {
  releaseImagePreview: () => undefined,
  uploadImage: (options: UploadOptions) => uploadImageImpl(options),
});
mockModule('@/components/media/imageUploadErrors', {
  asImageUploadError: () => ({ failure: { reason: 'transient', stage: 'complete' } }),
  formatImageUploadFailureMessage: (label: string) => `${label} failed`,
  formatImageUploadRetryLabel: (label: string) => `${label} retry`,
});
mockModule('@/components/ui/IconButton', {
  getIconButtonHitSlop: () => 0,
  getIconButtonOverlayGeometry: () => ({
    targetInset: 0,
    targetSize: 48,
    visualInset: 0,
  }),
  IconButton: 'IconButton',
});
mockModule('@/components/ui/TextField', { TextField: 'TextField' });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) => toastCalls.push([message, options]),
  }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ primary: '#00f', text: '#111', textSecondary: '#666' }),
});
mockModule('@/theme/tokens', {
  colors: { light: { fixedBlack: '#000', fixedWhite: '#fff' } },
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { labelSupportStack: {} },
  radii: { full: 999, sm: 8 },
  spacing: { md: 16, xs: 4 },
  typography: { sm: {}, xsm: {} },
});

const onValueChange = (value: PostComposerMediaValue) => {
  if (captureMediaValues) {
    mediaValues.push(value);
  }
};
const renderMedia = (props: PostComposerMediaControlsRenderProps) => {
  mediaRenderProps = props;
  return null;
};

before(async () => {
  ({ PostComposerMediaControls } = await import('./PostComposerMediaControls'));
});

beforeEach(() => {
  pickerResult = { assets: [asset()], canceled: false };
  uploadImageImpl = async (options) => {
    if (!options.isActive()) {
      return null;
    }
    const issued = await options.issue();
    if (!options.isActive()) {
      return null;
    }
    if (options.complete) {
      await options.complete(issued.mediaId);
    }
    return issued.mediaId;
  };
  mediaValues = [];
  captureMediaValues = true;
  mediaRenderProps = undefined;
  issueCalls = [];
  completeCalls = [];
  toastCalls = [];
  nextIssuedId = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

async function renderControls() {
  await act(async () => {
    renderer = create(
      createElement(PostComposerMediaControls, {
        actions: null,
        disabled: false,
        editorRef: { current: null },
        onValueChange,
        profileId: 'profile-a',
        render: renderMedia,
      }),
    );
  });
}

describe('PostComposerMediaControls deferred completion', () => {
  it('keeps an attached upload uncompleted until submit requests READY', async () => {
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    assert.equal(issueCalls.length, 1);
    assert.equal(completeCalls.length, 0);
    assert.deepEqual(mediaValues.at(-1)?.items, [{ altText: null, mediaId: 'media-1' }]);

    let completion!: Promise<void>;
    await act(async () => {
      completion = mediaValues.at(-1)!.completeUploads();
    });
    assert.equal(completeCalls.length, 1);
    assert.deepEqual(completeCalls[0]?.variables.input, { id: 'media-1' });

    await act(async () => {
      completeCalls[0]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-1', state: 'READY' } },
      });
      await completion;
    });
  });

  it('marks a completion failure retryable and retries with a new upload session', async () => {
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    let completion!: Promise<void>;
    await act(async () => {
      completion = mediaValues.at(-1)!.completeUploads();
    });
    assert.equal(completeCalls.length, 1);

    await act(async () => {
      completeCalls[0]?.onError(new Error('completion failed'));
      await assert.rejects(completion);
    });

    assert.equal(mediaRenderProps?.items[0]?.state, 'failed');
    assert.equal(toastCalls.length, 1);
    await act(async () => {
      const failedItem = mediaRenderProps?.items[0];
      assert.ok(failedItem);
      mediaRenderProps?.onMediaRetry(failedItem);
    });
    await flush();

    assert.equal(issueCalls.length, 2);
    assert.equal(mediaRenderProps?.items[0]?.state, 'ready');
    assert.equal(mediaRenderProps?.items[0]?.mediaId, 'media-2');
    assert.equal(completeCalls.length, 1);

    await act(async () => {
      completion = mediaValues.at(-1)!.completeUploads();
    });
    assert.equal(completeCalls.length, 2);
    assert.deepEqual(completeCalls[1]?.variables.input, { id: 'media-2' });
    await act(async () => {
      completeCalls[1]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-2', state: 'READY' } },
      });
      await completion;
    });
  });

  it('completes retained images sequentially and fails only the image that is not READY', async () => {
    pickerResult = { assets: [asset(), asset()], canceled: false };
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    assert.equal(issueCalls.length, 2);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'ready'],
    );

    let completion!: Promise<void>;
    let completionSettled = false;
    await act(async () => {
      completion = mediaValues.at(-1)!.completeUploads();
    });
    void completion.then(
      () => {
        completionSettled = true;
      },
      () => {
        completionSettled = true;
      },
    );
    assert.equal(completeCalls.length, 1);
    assert.deepEqual(completeCalls[0]?.variables.input, { id: 'media-1' });

    await act(async () => {
      completeCalls[0]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-1', state: 'READY' } },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(completeCalls.length, 2);
    assert.deepEqual(completeCalls[1]?.variables.input, { id: 'media-2' });
    assert.equal(completionSettled, false);

    await act(async () => {
      completeCalls[1]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-2', state: 'UPLOADING' } },
      });
      await assert.rejects(completion);
    });

    assert.equal(completionSettled, true);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'failed'],
    );
    assert.equal(toastCalls.length, 1);
    assert.deepEqual(toastCalls[0], ['2번째 이미지 failed', { tone: 'danger' }]);
  });

  it('rejects an outdated item snapshot and never completes a removed image', async () => {
    await renderControls();
    const emptySnapshot = mediaValues.at(-1)!;
    captureMediaValues = false;
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    await assert.rejects(emptySnapshot.completeUploads());
    assert.equal(completeCalls.length, 0);

    const item = mediaRenderProps?.items[0];
    assert.ok(item);
    captureMediaValues = true;
    await act(async () => mediaRenderProps?.onAltTextChange(item.key, '설명'));
    const attachedSnapshot = mediaValues.at(-1)!;
    await act(async () => mediaRenderProps?.onMediaRemove(item.key));

    await mediaValues.at(-1)!.completeUploads();
    await assert.rejects(attachedSnapshot.completeUploads());
    assert.equal(completeCalls.length, 0);
  });

  it('rejects submit completion while a retained image is still uploading', async () => {
    let resolveUpload!: (mediaId: string | null) => void;
    uploadImageImpl = async (options) => {
      await options.issue();
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    };
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    assert.equal(mediaValues.at(-1)?.hasPendingMedia, true);
    await assert.rejects(mediaValues.at(-1)!.completeUploads());
    assert.equal(completeCalls.length, 0);

    await act(async () => {
      resolveUpload('media-1');
    });
    await flush();
    assert.equal(mediaRenderProps?.items[0]?.state, 'ready');
  });
});
