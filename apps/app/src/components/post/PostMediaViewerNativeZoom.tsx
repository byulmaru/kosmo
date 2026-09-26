// The platform-specific resolver selects `.native.tsx` in the app bundle. Keeping the
// neutral entry point inert prevents Node-based Web tests from loading native modules.
export { NativeZoomImage } from './PostMediaViewerNativeZoom.web';
export type { NativeZoomImageProps } from './PostMediaViewerNativeZoomModel';
