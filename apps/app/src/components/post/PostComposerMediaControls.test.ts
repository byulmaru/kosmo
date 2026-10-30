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
type MediaMutationConfig = {
  readonly variables: {
    readonly input: {
      readonly actorProfileId?: string;
    };
  };
  readonly onCompleted: (
    response: IssueMediaResponse,
    errors?: ReadonlyArray<unknown> | null,
  ) => void;
  readonly onError: (error: Error) => void;
};
type UploadOptions = {
  readonly asset: ImagePickerAsset;
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
let uploadCalls = 0;
let renderer: ReactTestRenderer | null = null;
let nextIssuedId = 0;
let releasePendingUpload: (() => void) | undefined;
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
  useMutation: () => [
    (config: MediaMutationConfig) => {
      issueCalls.push(config);
      const id = `media-${++nextIssuedId}`;
      config.onCompleted({
        issueMediaUploadUrl: { media: { id }, uploadUrl: `https://upload.example/${id}` },
      });
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
    showToast: () => undefined,
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
  mockModule('@/components/media/imageUpload', {
    reportImageUploadError: () => undefined,
    releaseImagePreview: () => undefined,
    uploadImage: (options: UploadOptions) => {
      uploadCalls += 1;
      return uploadImageImpl(options);
    },
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
    return issued.mediaId;
  };
  mediaValues = [];
  captureMediaValues = true;
  mediaRenderProps = undefined;
  issueCalls = [];
  uploadCalls = 0;
  nextIssuedId = 0;
  releasePendingUpload = undefined;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  releasePendingUpload?.();
  releasePendingUpload = undefined;
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

describe('PostComposerMediaControls post request media', () => {
  it('provides ordered media IDs and processing choices after upload', async () => {
    pickerResult = { assets: [asset(), asset()], canceled: false };
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    const [first, second] = mediaRenderProps?.items ?? [];
    assert.ok(first);
    assert.ok(second);
    const initialIssueCount = issueCalls.length;
    const initialUploadCount = uploadCalls;
    await act(async () => {
      mediaRenderProps?.onAltTextChange(first.key, '  First image  ');
      mediaRenderProps?.onAltTextChange(second.key, 'Second image');
      mediaRenderProps?.onApplyNightshadeChange(second.key, true);
      mediaRenderProps?.onSensitiveMediaChange(true);
    });
    await flush();

    assert.deepEqual(mediaValues.at(-1)?.getPostRequestMedia(), [
      { altText: 'First image', applyNightshade: false, mediaId: 'media-1' },
      { altText: 'Second image', applyNightshade: true, mediaId: 'media-2' },
    ]);
    assert.equal(issueCalls.length, initialIssueCount);
    assert.equal(uploadCalls, initialUploadCount);
    assert.equal(mediaValues.at(-1)?.sensitiveMedia, true);
  });

  it('blocks post request media while a selected image is still uploading', async () => {
    uploadImageImpl = () =>
      new Promise<string | null>((resolve) => {
        releasePendingUpload = () => resolve(null);
      });
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());

    assert.equal(mediaValues.at(-1)?.hasPendingMedia, true);
    assert.throws(() => mediaValues.at(-1)?.getPostRequestMedia());
  });

  it('restores ordered media references without starting local uploads', async () => {
    await renderControls();

    mediaValues.at(-1)?.restorePostRequestMedia(
      [
        {
          altText: 'First saved description',
          applyNightshade: true,
          mediaId: 'saved-uploading-media',
          mediaState: 'UPLOADING',
          uri: 'https://private-preview.example/first',
        },
        {
          altText: null,
          applyNightshade: false,
          mediaId: 'saved-ready-media',
          mediaState: 'READY',
          uri: null,
        },
      ],
      true,
    );
    await flush();

    assert.deepEqual(mediaValues.at(-1)?.getPostRequestMedia(), [
      {
        altText: 'First saved description',
        applyNightshade: true,
        mediaId: 'saved-uploading-media',
      },
      { altText: null, applyNightshade: false, mediaId: 'saved-ready-media' },
    ]);
    assert.equal(mediaValues.at(-1)?.sensitiveMedia, true);
    assert.deepEqual(
      mediaRenderProps?.items.map((item) => ({
        asset: item.asset,
        altText: item.altText,
        previewUri: item.previewUri,
        state: item.state,
      })),
      [
        {
          asset: null,
          altText: 'First saved description',
          previewUri: 'https://private-preview.example/first',
          state: 'ready',
        },
        { asset: null, altText: '', previewUri: null, state: 'ready' },
      ],
    );
    assert.equal(uploadCalls, 0);
    assert.equal(issueCalls.length, 0);
  });

  it('requires reselection for one unavailable restored ID and keeps it blocked if its flag is reverted', async () => {
    await renderControls();
    mediaValues.at(-1)?.restorePostRequestMedia([
      {
        altText: 'First saved ALT',
        applyNightshade: false,
        mediaId: 'available-media',
        mediaState: 'READY',
      },
      {
        altText: 'Unavailable saved ALT',
        applyNightshade: false,
        mediaId: 'unavailable-media',
        mediaState: 'UPLOADING',
      },
    ]);
    await flush();

    mediaValues.at(-1)?.requirePostRequestMediaReselection('unavailable-media');
    await flush();
    assert.equal(mediaRenderProps?.items[0]?.state, 'ready');
    assert.equal(mediaRenderProps?.items[1]?.requiresReselection, true);
    assert.throws(() => mediaValues.at(-1)?.getPostRequestMedia());

    const unavailable = mediaRenderProps?.items[1];
    assert.ok(unavailable);
    await act(async () => mediaRenderProps?.onApplyNightshadeChange(unavailable.key, true));
    await act(async () => mediaRenderProps?.onApplyNightshadeChange(unavailable.key, false));
    await flush();

    assert.equal(mediaRenderProps?.items[0]?.state, 'ready');
    assert.equal(mediaRenderProps?.items[1]?.requiresReselection, true);
    assert.equal(mediaRenderProps?.items[1]?.state, 'failed');
    assert.equal(uploadCalls, 0);
    assert.equal(issueCalls.length, 0);
  });

  it('requires a fresh file for a restored Nightshade change and replaces only that slot', async () => {
    await renderControls();
    mediaValues.at(-1)?.restorePostRequestMedia([
      {
        altText: 'Keep this ALT',
        applyNightshade: false,
        mediaId: 'saved-uploading-media',
        mediaState: 'UPLOADING',
        uri: 'https://protected-derivative.example/first',
      },
      {
        altText: 'Keep sibling ALT',
        applyNightshade: true,
        mediaId: 'saved-ready-media',
        mediaState: 'READY',
        uri: 'https://private-preview.example/second',
      },
    ]);
    await flush();

    const restoredFirst = mediaRenderProps?.items[0];
    assert.ok(restoredFirst);
    await act(async () => mediaRenderProps?.onApplyNightshadeChange(restoredFirst.key, true));
    await flush();

    assert.equal(mediaRenderProps?.items[0]?.requiresReselection, true);
    assert.equal(mediaRenderProps?.items[0]?.state, 'failed');
    assert.throws(() => mediaValues.at(-1)?.getPostRequestMedia());
    assert.equal(uploadCalls, 0);
    assert.equal(issueCalls.length, 0);

    await act(async () => mediaRenderProps?.onAltTextChange(restoredFirst.key, 'Edited saved ALT'));
    await flush();
    const needsReselection = mediaRenderProps?.items[0];
    assert.ok(needsReselection);
    await act(async () => mediaRenderProps?.onMediaRetry(needsReselection));
    await flush();

    assert.equal(uploadCalls, 1);
    assert.equal(issueCalls.length, 1);
    assert.deepEqual(mediaValues.at(-1)?.getPostRequestMedia(), [
      { altText: 'Edited saved ALT', applyNightshade: true, mediaId: 'media-1' },
      { altText: 'Keep sibling ALT', applyNightshade: true, mediaId: 'saved-ready-media' },
    ]);
    assert.equal(mediaRenderProps?.items[0]?.kind, 'local');
    assert.equal(mediaRenderProps?.items[0]?.asset?.uri, 'file:///local/image.jpg');
    assert.equal(mediaRenderProps?.items[1]?.mediaId, 'saved-ready-media');
  });
});
