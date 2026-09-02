type ImageDimensions = {
  readonly height: number;
  readonly width: number;
};

type ImageResult = ImageDimensions & {
  readonly uri: string;
};

type ImageRef = ImageResult & {
  release(): void;
  saveAsync(options?: unknown): Promise<ImageResult>;
};

type ImageManipulatorContext = {
  release(): void;
  renderAsync(): Promise<ImageRef>;
  resize(size: ImageDimensions): ImageManipulatorContext;
};

const mockImageUri = 'data:image/webp;base64,UklGRg==';

function createImageRef(dimensions: ImageDimensions): ImageRef {
  return {
    ...dimensions,
    release() {},
    async saveAsync() {
      return { ...dimensions, uri: mockImageUri };
    },
    uri: mockImageUri,
  };
}

function createImageManipulatorContext(): ImageManipulatorContext {
  let dimensions: ImageDimensions = { height: 96, width: 96 };

  return {
    release() {},
    async renderAsync() {
      return createImageRef(dimensions);
    },
    resize(size) {
      dimensions = { height: size.height, width: size.width };
      return this;
    },
  };
}

export const ImageManipulator = {
  manipulate() {
    return createImageManipulatorContext();
  },
};

export const SaveFormat = {
  WEBP: 'webp',
} as const;
