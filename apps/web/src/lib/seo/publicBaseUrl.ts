export function getPublicBaseUrl(): URL {
  const raw = (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ""
  ).trim();

  const fallback = "https://coinwaka.com";
  const urlString = raw || fallback;

  try {
    const url = new URL(urlString);

    // Normalize to origin-only.
    url.pathname = "";
    url.search = "";
    url.hash = "";

    // Prefer https in non-local environments.
    if (url.hostname !== "localhost" && url.protocol !== "https:") {
      url.protocol = "https:";
    }

    return url;
  } catch {
    return new URL(fallback);
  }
}

export function getPublicBaseUrlOrigin(): string {
  return getPublicBaseUrl().origin;
}
