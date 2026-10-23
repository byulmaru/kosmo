import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { reportImageUploadError as ReportImageUploadErrorFn } from '../media/imageUpload';
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
type CaptureContext = Record<string, string | number>;
type CaptureCall = { readonly context?: CaptureContext; readonly error: Error };
type ReportImageUploadError = typeof ReportImageUploadErrorFn;

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
let captureCalls: CaptureCall[] = [];
let captureThrows = false;
let renderer: ReactTestRenderer | null = null;
let nextIssuedId = 0;
let PostComposerMediaControls: typeof PostComposerMediaControlsComponent;
let reportImageUploadError: ReportImageUploadError;

const asset = (): ImagePickerAsset =>
  ({ height: 100, uri: 'file:///local/image.jpg', width: 100 }) as ImagePickerAsset;

mockModule('@/observability/sentry', {
  captureHandledError: (error: Error, context?: CaptureContext) => {
    captureCalls.push({ context, error });
    if (captureThrows) {
      throw new Error('Sentry unavailable');
    }
  },
});

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
  ({ reportImageUploadError } = await import(
    new URL('../media/imageUpload.ts', import.meta.url).href
  ));
  mockModule('@/components/media/imageUpload', {
    reportImageUploadError,
    releaseImagePreview: () => undefined,
    uploadImage: (options: UploadOptions) => uploadImageImpl(options),
  });
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
  captureCalls = [];
  captureThrows = false;
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
    const privateDetail =
      'completion failed for file:///private/photo.jpg at https://upload.example/private?token=secret';
    const completionFailure = new Error(privateDetail);
    captureThrows = true;
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    let completion!: Promise<void>;
    await act(async () => {
      completion = mediaValues.at(-1)!.completeUploads();
    });
    assert.equal(completeCalls.length, 1);

    await act(async () => {
      completeCalls[0]?.onError(completionFailure);
      await assert.rejects(completion, (error: unknown) => error === completionFailure);
    });

    assert.equal(captureCalls.length, 1);
    assert.deepEqual(captureCalls[0]?.context, {
      operation: 'complete',
      reason: 'transient',
      stage: 'complete',
    });
    const capturedError = captureCalls[0]?.error;
    assert.ok(capturedError);
    assert.notEqual(capturedError, completionFailure);
    assert.equal(capturedError.name, 'ImageUploadError');
    assert.equal(capturedError.message, 'Image upload failed');
    assert.equal((capturedError as Error & { cause?: unknown }).cause, undefined);
    assert.equal(capturedError.stack?.includes(privateDetail), false);
    assert.equal(mediaRenderProps?.items[0]?.state, 'failed');
    assert.deepEqual(toastCalls, [
      ['1번째 이미지 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', { tone: 'danger' }],
    ]);
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
    assert.equal(captureCalls.length, 1);
  });

  it('completes retained images concurrently and waits until all are READY', async () => {
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
    assert.equal(completeCalls.length, 2);
    assert.deepEqual(completeCalls[0]?.variables.input, { id: 'media-1' });
    assert.deepEqual(completeCalls[1]?.variables.input, { id: 'media-2' });

    await act(async () => {
      completeCalls[0]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-1', state: 'READY' } },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(completionSettled, false);

    await act(async () => {
      completeCalls[1]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-2', state: 'READY' } },
      });
      await completion;
    });

    assert.equal(completionSettled, true);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'ready'],
    );
    assert.equal(toastCalls.length, 0);
  });

  it('waits for every completion failure and leaves successful siblings ready', async () => {
    pickerResult = { assets: [asset(), asset(), asset()], canceled: false };
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    assert.equal(issueCalls.length, 3);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'ready', 'ready'],
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
    assert.equal(completeCalls.length, 3);
    assert.deepEqual(
      completeCalls.map((call) => call.variables.input.id),
      ['media-1', 'media-2', 'media-3'],
    );

    await act(async () => {
      completeCalls[0]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-1', state: 'READY' } },
      });
      completeCalls[1]?.onCompleted({
        completeMediaUpload: { media: { id: 'media-2', state: 'UPLOADING' } },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(completionSettled, false);

    await act(async () => {
      completeCalls[2]?.onError(new Error('third completion failed'));
      await assert.rejects(completion);
    });

    assert.equal(completionSettled, true);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'failed', 'failed'],
    );
    assert.deepEqual(toastCalls, [
      ['2번째 이미지 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', { tone: 'danger' }],
      ['3번째 이미지 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', { tone: 'danger' }],
    ]);
    assert.equal(captureCalls.length, 2);

    await act(async () => {
      const failedItem = mediaRenderProps?.items[1];
      assert.ok(failedItem);
      mediaRenderProps?.onMediaRetry(failedItem);
    });
    await flush();
    assert.equal(issueCalls.length, 4);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => item.state),
      ['ready', 'ready', 'failed'],
    );
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
