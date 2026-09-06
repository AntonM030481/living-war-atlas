type AtlasWindow = Window & {
  __LWA_LOCAL_HOST__?: boolean;
  __LWA_IOS_SIMULATOR__?: boolean;
};

function atlasWindow(): AtlasWindow {
  return window as AtlasWindow;
}

export function isLocalHost(): boolean {
  return Boolean(atlasWindow().__LWA_LOCAL_HOST__);
}

export function developerFeaturesEnabled(): boolean {
  const appWindow = atlasWindow();
  return Boolean(appWindow.__LWA_LOCAL_HOST__ || appWindow.__LWA_IOS_SIMULATOR__);
}
