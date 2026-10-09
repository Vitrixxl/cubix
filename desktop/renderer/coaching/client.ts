/**
 * Coaching on the web app: the shared client (src/client/lib/coaching.ts) on the community's host; pictures and videos
 * shown from object URLs.
 */
import { host } from "../community/client";
import { Coaching, CoachingError } from "../../../src/client/lib/coaching";
import { tr } from "../../../src/client/i18n";

export * from "../../../src/client/lib/coaching";

class WebCoaching extends Coaching {
  /** Pictures and videos fetched with the token, as object URLs, by media id. */
  private media = new Map<string, Promise<string>>();

  attach(user: string | null) {
    if (user !== this.user) {
      for (const url of this.media.values()) void url.then(URL.revokeObjectURL, () => {});
      this.media.clear();
    }
    super.attach(user);
  }
  /** A picture or a video of a conversation as a local URL: only its two parties may fetch it, with their token. */
  mediaUrl(id: string) {
    let url = this.media.get(id);
    if (!url) {
      url = this.mediaSource(id)
        .then(({ uri, headers }) => fetch(uri, { headers }))
        .then(async (response) => {
          if (!response.ok) throw new CoachingError(response.status, tr("This picture or video is unavailable."));
          return URL.createObjectURL(await response.blob());
        });
      url.catch(() => this.media.delete(id));
      this.media.set(id, url);
    }
    return url;
  }
}

export const coaching = new WebCoaching(host);
