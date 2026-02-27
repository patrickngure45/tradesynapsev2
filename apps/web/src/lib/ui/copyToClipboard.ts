export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Prefer the async Clipboard API when available.
  try {
    const nav = (globalThis as unknown as { navigator?: Navigator }).navigator;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }

  // Fallback for older/stricter browser contexts.
  try {
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) return false;

    const textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    doc.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const ok = doc.execCommand?.("copy") ?? false;
    doc.body.removeChild(textarea);

    return Boolean(ok);
  } catch {
    return false;
  }
}
