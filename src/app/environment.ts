export function isLocalHost(): boolean {
  return Boolean((window as Window & { __LWA_LOCAL_HOST__?: boolean }).__LWA_LOCAL_HOST__);
}
