export const ACTING_USER_STORAGE_KEY = "proofpack.acting_user_id";

export function readActingUserIdPreference(href: string = window.location.href): string {
  let urlUserId = "";
  try {
    urlUserId = new URL(href).searchParams.get("user_id") ?? "";
  } catch {
    // ignore
  }

  let stored = "";
  try {
    stored = window.localStorage.getItem(ACTING_USER_STORAGE_KEY) ?? "";
  } catch {
    // ignore
  }

  return urlUserId || stored;
}

export function persistActingUserIdPreference(id: string, href: string = window.location.href): void {
  if (!id) return;

  try {
    window.localStorage.setItem(ACTING_USER_STORAGE_KEY, id);
  } catch {
    // ignore
  }

  try {
    const url = new URL(href);
    url.searchParams.set("user_id", id);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}
