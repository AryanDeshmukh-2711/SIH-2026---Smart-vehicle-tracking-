/**
 * Sharing a link to something in the app.
 *
 * Uses the platform share sheet where there is one — the common case on the
 * phones this is built for — and falls back to the clipboard on desktop. Returns
 * the confirmation to show, or null when the platform handled it visibly itself
 * (the share sheet is its own feedback) or the user cancelled.
 */
export interface ShareTarget {
  title: string;
  text: string;
  /** Path within the app, e.g. `/bus/B-3312`. */
  path: string;
}

export async function shareLink(target: ShareTarget): Promise<string | null> {
  const url = `${window.location.origin}${target.path}`;

  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: target.title, text: target.text, url });
      return null;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'Link copied';
    }
  } catch {
    // A dismissed share sheet rejects, and a clipboard write can be blocked
    // without a user gesture. Neither is worth reporting as a failure.
    return null;
  }

  return null;
}
