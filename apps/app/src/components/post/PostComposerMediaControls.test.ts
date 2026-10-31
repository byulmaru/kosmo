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
      mediaRenderProps?.onApplyAiProhibitFilterChange(second.key, true);
      mediaRenderProps?.onSensitiveMediaChange(true);
    });
    await flush();

    assert.deepEqual(mediaValues.at(-1)?.getPostRequestMedia(), [
      { altText: 'First image', applyAiProhibitFilter: false, mediaId: 'media-1' },
      { altText: 'Second image', applyAiProhibitFilter: true, mediaId: 'media-2' },
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

  it('requires a new file after admission rejects an uploaded image and replaces only that slot', async () => {
    pickerResult = { assets: [asset(), asset()], canceled: false };
    await renderControls();
    await act(async () => mediaRenderProps?.onMediaAction());
    await flush();

    const [first, second] = mediaRenderProps?.items ?? [];
    assert.ok(first);
    assert.ok(second);
    await act(async () => {
      mediaRenderProps?.onAltTextChange(first.key, 'Replace this ALT');
      mediaRenderProps?.onApplyAiProhibitFilterChange(first.key, true);
      mediaRenderProps?.onAltTextChange(second.key, 'Keep sibling ALT');
    });
    mediaValues.at(-1)?.requirePostRequestMediaReselection(first.mediaId!);
    await flush();

    assert.equal(mediaRenderProps?.items[0]?.requiresReselection, true);
    assert.equal(mediaRenderProps?.items[0]?.state, 'failed');
    assert.equal(mediaRenderProps?.items[1]?.state, 'ready');
    assert.throws(() => mediaValues.at(-1)?.getPostRequestMedia());

    const needsReselection = mediaRenderProps?.items[0];
    assert.ok(needsReselection);
    await act(async () => mediaRenderProps?.onMediaRetry(needsReselection));
    await flush();

    assert.equal(uploadCalls, 3);
    assert.equal(issueCalls.length, 3);
    assert.deepEqual(mediaValues.at(-1)?.getPostRequestMedia(), [
      { altText: 'Replace this ALT', applyAiProhibitFilter: true, mediaId: 'media-3' },
      { altText: 'Keep sibling ALT', applyAiProhibitFilter: false, mediaId: 'media-2' },
    ]);
    assert.equal(mediaRenderProps?.items[0]?.asset?.uri, 'file:///local/image.jpg');
    assert.equal(mediaRenderProps?.items[1]?.mediaId, 'media-2');
  });
});
