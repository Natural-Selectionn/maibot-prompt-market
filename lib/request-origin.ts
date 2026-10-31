export function requestOrigin(request: Request): string {
  if (process.env.MAIBOT_RUNTIME === "vps") {
    if (process.env.MAIBOT_PUBLIC_ORIGIN) return new URL(process.env.MAIBOT_PUBLIC_ORIGIN).origin;
    // The VPS server listens on loopback only. Nginx replaces both headers;
    // never enable this trust boundary on a directly exposed Node listener.
    const host = request.headers.get("x-forwarded-host");
    const protocol = request.headers.get("x-forwarded-proto");
    if (host && (protocol === "http" || protocol === "https")) {
      return new URL(`${protocol}://${host}`).origin;
    }
  }
  return new URL(request.url).origin;
}
