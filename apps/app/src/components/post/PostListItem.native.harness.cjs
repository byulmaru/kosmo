'use strict';

/* eslint @typescript-eslint/no-require-imports: off -- The CommonJS loader is needed to scope Babel's Flow transform and intercept React Native internals in this test process. */

const Module = require('node:module');
const React = require('react');
const babel = require('@babel/core');

const expoPreset = require.resolve('babel-preset-expo');

const ROOT_TAG = 801;
const views = new Map();
const childrenByParent = new Map();
const originalLoad = Module._load;
const originalJsLoader = Module._extensions['.js'];
const hadDev = Object.prototype.hasOwnProperty.call(global, '__DEV__');
const previousDev = global.__DEV__;
const hadActEnvironment = Object.prototype.hasOwnProperty.call(global, 'IS_REACT_ACT_ENVIRONMENT');
const previousActEnvironment = global.IS_REACT_ACT_ENVIRONMENT;
let environmentInstalled = false;
let rootMounted = false;
let nextTouchId = 0;
let activeTouch = null;
let activeResponderTag = null;
let nativeEmitter = null;

function removeSubtree(tag) {
  for (const childTag of childrenByParent.get(tag) ?? []) {
    removeSubtree(childTag);
  }
  childrenByParent.delete(tag);
  views.delete(tag);
}

const uiManager = {
  createView(tag, type, _rootTag, props) {
    views.set(tag, { type, props: { ...props } });
  },
  updateView(tag, type, props) {
    const previous = views.get(tag) ?? { type, props: {} };
    views.set(tag, { type, props: { ...previous.props, ...props } });
  },
  setChildren(parentTag, childTags) {
    childrenByParent.set(parentTag, [...childTags]);
  },
  manageChildren(
    parentTag,
    moveFromIndices,
    moveToIndices,
    addChildTags,
    addAtIndices,
    removeAtIndices,
  ) {
    const previous = childrenByParent.get(parentTag) ?? [];
    const movedFrom = new Set(moveFromIndices ?? []);
    const removedAt = new Set(removeAtIndices ?? []);
    const remaining = previous.filter((_, index) => !movedFrom.has(index) && !removedAt.has(index));
    const placed = new Map();
    (moveFromIndices ?? []).forEach((from, index) =>
      placed.set(moveToIndices[index], previous[from]),
    );
    (addAtIndices ?? []).forEach((at, index) => placed.set(at, addChildTags[index]));
    const nextLength =
      remaining.length + (moveFromIndices?.length ?? 0) + (addChildTags?.length ?? 0);
    const next = [];
    let remainingIndex = 0;
    for (let index = 0; index < nextLength; index += 1) {
      next.push(placed.has(index) ? placed.get(index) : remaining[remainingIndex++]);
    }
    const liveTags = new Set(next);
    for (const oldTag of previous) {
      if (!liveTags.has(oldTag)) {
        removeSubtree(oldTag);
      }
    }
    childrenByParent.set(parentTag, next);
  },
  removeRootView(rootTag) {
    for (const childTag of childrenByParent.get(rootTag) ?? []) {
      removeSubtree(childTag);
    }
    childrenByParent.delete(rootTag);
  },
  setJSResponder(tag) {
    activeResponderTag = tag;
  },
  clearJSResponder() {
    activeResponderTag = null;
  },
  measure(_tag, callback) {
    callback(0, 0, 100, 100, 0, 0);
  },
};

const touchEvents = ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel'];
const customBubblingEventTypes = Object.fromEntries(
  touchEvents.map((name) => [
    `top${name}`,
    {
      phasedRegistrationNames: { bubbled: `on${name}`, captured: `on${name}Capture` },
      dependencies: [`top${name}`],
    },
  ]),
);
const modalDismissEvent = { topDismiss: { registrationName: 'onDismiss' } };
const fakePrivate = {
  RCTEventEmitter: {
    register(emitter) {
      nativeEmitter = emitter;
    },
  },
  ReactNativeViewConfigRegistry: {
    customBubblingEventTypes,
    customDirectEventTypes: modalDismissEvent,
    get(type) {
      return {
        uiViewClassName: type,
        validAttributes: {
          accessibilityLabel: true,
          accessibilityRole: true,
          accessibilityState: true,
          accessible: true,
          disabled: true,
          onStartShouldSetResponder: true,
          onResponderGrant: true,
          onResponderMove: true,
          onResponderRelease: true,
          onResponderTerminate: true,
          onTouchStart: true,
          onTouchEnd: true,
          onTouchCancel: true,
          style: true,
          testID: true,
          visible: true,
        },
        bubblingEventTypes: {},
        directEventTypes: type === 'RCTModalHostView' ? modalDismissEvent : {},
      };
    },
  },
  UIManager: uiManager,
  ReactFiberErrorDialog: {
    showErrorDialog() {
      return false;
    },
  },
  TextInputState: {},
  deepDiffer(...args) {
    return deepDiffer(...args);
  },
  deepFreezeAndThrowInDev(value) {
    return value;
  },
  deepFreezeAndThrowOnMutationInDev(value) {
    return value;
  },
  flattenStyle(value) {
    return value;
  },
  createPublicInstance(value) {
    return value;
  },
  getInternalInstanceHandleFromPublicInstance(value) {
    return value;
  },
  getNativeTagFromPublicInstance(value) {
    return value?._nativeTag;
  },
  getNodeFromPublicInstance(value) {
    return value;
  },
  legacySendAccessibilityEvent() {},
};

const Platform = {
  OS: 'ios',
  Version: 18,
  isTV: false,
  select(options) {
    return options.ios ?? options.default;
  },
};
const StyleSheet = {
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  create(styles) {
    return styles;
  },
  flatten(style) {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map((item) => StyleSheet.flatten(item) ?? {}));
    }
    return style;
  },
};

function hostComponent(type) {
  const Host = React.forwardRef((props, ref) => React.createElement(type, { ...props, ref }));
  Host.displayName = type;
  return Host;
}

const View = hostComponent('RCTView');
const Text = hostComponent('RCTText');
const ScrollView = hostComponent('RCTScrollView');
ScrollView.Context = React.createContext(null);
const ActivityIndicator = hostComponent('RCTActivityIndicator');
const RCTModalHostView = hostComponent('RCTModalHostView');
const RootTagContext = React.createContext(ROOT_TAG);
const AppContainer = ({ children }) => children;
const I18nManager = {
  isRTL: false,
  allowRTL() {},
  forceRTL() {},
  getConstants() {
    return { isRTL: false };
  },
};
const NativeEventEmitter = class {
  addListener() {
    return { remove() {} };
  }
};
const VirtualizedLists = { VirtualizedListContextResetter: React.Fragment };

function isPressability(filename) {
  return filename?.endsWith('/Libraries/Pressability/Pressability.js');
}
function isPressable(filename) {
  return filename?.endsWith('/Libraries/Components/Pressable/Pressable.js');
}
function isModal(filename) {
  return filename?.endsWith('/Libraries/Modal/Modal.js');
}
function loadNativeHarnessModule(request, parent, isMain) {
  const parentFilename = parent?.filename;

  if (request === 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface') {
    return fakePrivate;
  }
  if (request === 'react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore') {
    return {};
  }
  if (request === 'react-native/Libraries/ReactNative/UIManager') {
    return { __esModule: true, default: uiManager };
  }
  if (isPressability(parentFilename)) {
    if (request.includes('ReactNativeFeatureFlags')) {
      return {
        shouldPressibilityUseW3CPointerEventsForHover() {
          return false;
        },
      };
    }
    if (request === '../Components/Sound/SoundManager') {
      return { __esModule: true, default: { playTouchSound() {} } };
    }
    if (request === '../ReactNative/UIManager') {
      return { __esModule: true, default: uiManager };
    }
    if (request === '../Utilities/Platform') {
      return { __esModule: true, default: Platform };
    }
    if (request === './HoverState') {
      return {
        isHoverEnabled() {
          return false;
        },
      };
    }
    if (request === './PressabilityPerformanceEventEmitter.js') {
      return { __esModule: true, default: { emitEvent() {} } };
    }
  }
  if (isPressable(parentFilename)) {
    if (request === '../View/View') {
      return { __esModule: true, default: View };
    }
    if (request === './useAndroidRippleForView') {
      return { __esModule: true, default: () => undefined };
    }
    if (request === '../../Pressability/PressabilityDebug') {
      return { PressabilityDebugView: () => null };
    }
  }
  if (isModal(parentFilename)) {
    if (request === '../Components/ScrollView/ScrollView') {
      return { __esModule: true, default: ScrollView };
    }
    if (request === '../Components/View/View') {
      return { __esModule: true, default: View };
    }
    if (request === '../ReactNative/AppContainer') {
      return { __esModule: true, default: AppContainer };
    }
    if (request === '../ReactNative/I18nManager') {
      return { __esModule: true, default: I18nManager };
    }
    if (request === '../ReactNative/RootTag') {
      return { RootTagContext };
    }
    if (request === '../StyleSheet/StyleSheet') {
      return { __esModule: true, default: StyleSheet };
    }
    if (request === '../Utilities/Platform') {
      return { __esModule: true, default: Platform };
    }
    if (request === '../EventEmitter/NativeEventEmitter') {
      return { __esModule: true, default: NativeEventEmitter };
    }
    if (request === './NativeModalManager') {
      return null;
    }
    if (request === './RCTModalHostViewNativeComponent') {
      return { __esModule: true, default: RCTModalHostView };
    }
    if (request === '@react-native/virtualized-lists') {
      return VirtualizedLists;
    }
  }

  return originalLoad.call(this, request, parent, isMain);
}
function loadFlowModule(module, filename) {
  if (
    filename.includes('/node_modules/react-native/') &&
    !filename.endsWith('/ReactNativeRenderer-dev.js')
  ) {
    const transformed = babel.transformFileSync(filename, {
      presets: [expoPreset],
      configFile: false,
      babelrc: false,
    });
    return module._compile(transformed.code, filename);
  }
  return originalJsLoader(module, filename);
}
function installEnvironment() {
  if (environmentInstalled) {
    return;
  }
  global.__DEV__ = true;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Module._load = loadNativeHarnessModule;
  Module._extensions['.js'] = loadFlowModule;
  environmentInstalled = true;
}
function restoreEnvironment() {
  if (!environmentInstalled) {
    return;
  }
  Module._load = originalLoad;
  Module._extensions['.js'] = originalJsLoader;
  if (hadDev) {
    global.__DEV__ = previousDev;
  } else {
    delete global.__DEV__;
  }
  if (hadActEnvironment) {
    global.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  } else {
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
  environmentInstalled = false;
}

installEnvironment();
const { default: deepDiffer } = require('react-native/Libraries/Utilities/differ/deepDiffer');
const { default: Pressable } = require('react-native/Libraries/Components/Pressable/Pressable');
const { default: Modal } = require('react-native/Libraries/Modal/Modal');
const { default: PanResponder } = require('react-native/Libraries/Interaction/PanResponder');
const renderer = require('react-native/Libraries/Renderer/implementations/ReactNativeRenderer-dev');

class AnimatedValue {
  constructor(value) {
    this.value = value;
  }
  setValue(value) {
    this.value = value;
  }
  interpolate() {
    return this;
  }
}
const Animated = {
  View: hostComponent('RCTAnimatedView'),
  Value: AnimatedValue,
  timing(value, config) {
    return {
      start(callback) {
        value.setValue(config.toValue);
        callback?.({ finished: true });
      },
      stop() {},
    };
  },
};
const nativeExports = {
  ActivityIndicator,
  Animated,
  Easing: { bezier: () => () => 1 },
  findNodeHandle: renderer.findNodeHandle,
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions() {
    return { width: 390, height: 844, scale: 1, fontScale: 1 };
  },
};

function dispatchTouch(type, touch) {
  if (!nativeEmitter) {
    throw new Error('ReactNativeRenderer-dev did not register its native event bridge');
  }
  nativeEmitter.receiveTouches(type, [touch], [0]);
}

function render(element) {
  installEnvironment();
  renderer.render(element, ROOT_TAG, undefined, {
    onUncaughtError(error) {
      throw error;
    },
    onRecoverableError(error) {
      throw error;
    },
  });
  rootMounted = true;
}

function unmount() {
  if (rootMounted) {
    renderer.unmountComponentAtNode(ROOT_TAG);
    rootMounted = false;
  }
  views.clear();
  childrenByParent.clear();
  activeTouch = null;
  activeResponderTag = null;
}

function firstTag(predicate) {
  for (const [tag, view] of views) {
    if (predicate(view)) {
      return tag;
    }
  }
  return undefined;
}
function tagByTestID(id) {
  return firstTag(({ props }) => props.testID === id);
}
function tagByAccessibilityLabel(label) {
  return firstTag(
    ({ props }) => props.accessibilityLabel === label || props['aria-label'] === label,
  );
}
function tagByViewName(name) {
  return firstTag(({ type }) => type === name);
}
function viewProps(tag) {
  return views.get(tag)?.props;
}
function modalDidDismiss() {
  const tag = firstTag(({ type }) => type === 'RCTModalHostView');
  if (tag === undefined) {
    throw new Error('The native Modal host is not mounted');
  }
  if (!nativeEmitter) {
    throw new Error('ReactNativeRenderer-dev did not register its native event bridge');
  }
  nativeEmitter.receiveEvent(tag, 'topDismiss', {});
}
function touchStart(tag, point = { x: 20, y: 20 }) {
  installEnvironment();
  if (!views.has(tag)) {
    throw new Error(`No rendered native view exists for tag ${String(tag)}`);
  }
  activeTouch = {
    target: tag,
    identifier: ++nextTouchId,
    pageX: point.x,
    pageY: point.y,
    locationX: point.x,
    locationY: point.y,
    timestamp: nextTouchId * 100,
  };
  dispatchTouch('topTouchStart', activeTouch);
}
function touchMove(point) {
  if (!activeTouch) {
    throw new Error('touchMove() requires an active touch');
  }
  activeTouch = {
    ...activeTouch,
    pageX: point.x,
    pageY: point.y,
    locationX: point.x,
    locationY: point.y,
    timestamp: activeTouch.timestamp + 1000,
  };
  dispatchTouch('topTouchMove', activeTouch);
}
function touchEnd() {
  if (!activeTouch) {
    throw new Error('touchEnd() requires an active touch; call touchStart(tag) first');
  }
  const touch = activeTouch;
  activeTouch = null;
  dispatchTouch('topTouchEnd', touch);
}
function touchCancel() {
  if (!activeTouch) {
    throw new Error('touchCancel() requires an active touch; call touchStart(tag) first');
  }
  const touch = activeTouch;
  activeTouch = null;
  dispatchTouch('topTouchCancel', touch);
}
function responderTag() {
  return activeResponderTag;
}
function cleanup() {
  unmount();
  restoreEnvironment();
}

module.exports = {
  cleanup,
  modalDidDismiss,
  nativeExports,
  PanResponder,
  render,
  responderTag,
  tagByAccessibilityLabel,
  tagByTestID,
  tagByViewName,
  touchCancel,
  touchEnd,
  touchMove,
  touchStart,
  unmount,
  viewProps,
};
