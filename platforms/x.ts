import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult, type MediaItem } from "../shared.ts";

const ARTICLE_SELECTOR = 'xpath=//article[@tabindex="-1"]';

// 從推文 URL 取出 tweet id（支援 /user/status/123 與 /i/status/123）
function extractTweetId(url: string): string | null {
  const m = url.match(/status(?:es)?\/(\d+)/);
  return m ? m[1]! : null;
}

// react-tweet 使用的 token 演算法，用來呼叫公開的 syndication endpoint
function getSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

type SyndicationVariant = { bitrate?: number; content_type: string; url: string };
type SyndicationMedia = {
  type: "photo" | "video" | "animated_gif";
  media_url_https?: string;
  video_info?: { variants: SyndicationVariant[] };
};
type SyndicationTweet = {
  text?: string;
  favorite_count?: number;
  user?: { name?: string; screen_name?: string };
  mediaDetails?: SyndicationMedia[];
};

// 從 syndication 媒體物件挑出可播放的 mp4（取最高 bitrate）；沒有則回退縮圖
function mediaFromSyndication(details: SyndicationMedia[]): MediaItem[] {
  const media: MediaItem[] = [];
  for (const d of details) {
    if (d.type === "photo") {
      if (d.media_url_https) media.push({ type: "image", url: d.media_url_https });
      continue;
    }

    // video / animated_gif：挑最高 bitrate 的 mp4 變體
    const mp4s = (d.video_info?.variants ?? [])
      .filter((v) => v.content_type === "video/mp4")
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (mp4s.length > 0) {
      media.push({ type: "video", url: mp4s[0]!.url.split("?")[0]! });
    } else if (d.media_url_https) {
      media.push({ type: "image", url: d.media_url_https });
    }
  }
  return media;
}

// 呼叫 X 公開的 syndication API 取得推文資料（含可播放 mp4），失敗回 null
async function fetchSyndication(id: string): Promise<SyndicationTweet | null> {
  const token = getSyndicationToken(id);
  const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;
  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[jumo-x] syndication 回應非 200: ${res.status}`);
      return null;
    }
    return (await res.json()) as SyndicationTweet;
  } catch (e) {
    console.warn("[jumo-x] syndication 擷取失敗:", e);
    return null;
  }
}

defineFn(
  "jumo-x",
  async (ctx, params) => {
    const { url } = params;

    console.log(`[jumo-x] 擷取內容: ${url}`);

    // 優先走 syndication API：一次拿到內文、作者、按讚數與可播放 mp4，且無需開瀏覽器
    const tweetId = extractTweetId(url);
    if (tweetId) {
      const tweet = await fetchSyndication(tweetId);
      if (tweet && (tweet.text || tweet.user?.name)) {
        return {
          content: tweet.text ?? "",
          author: tweet.user?.name ?? "",
          username: tweet.user?.screen_name ? `@${tweet.user.screen_name}` : "",
          likes: tweet.favorite_count ?? 0,
          media: mediaFromSyndication(tweet.mediaDetails ?? []),
        };
      }
      console.warn("[jumo-x] syndication 無有效資料，改用瀏覽器擷取");
    }

    // Fallback：瀏覽器擷取內文/作者與圖片（影片在 DOM 僅有 blob/HLS，退而取 poster 縮圖）
    try {
      const stagehand = await initStagehand(ctx.session.connectUrl, params.apiKey);
      const page = stagehand.context.pages()[0]!;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      const articleObserveResult = await stagehand.observe("find the topmost tweet article element");
      console.log(articleObserveResult);

      const metadata = await stagehand.extract(
        "Extract the tweet text (first 70 words), author's display name and author's @ handle",
        z.object({
          content: z.string().describe("the tweet text"),
          author: z.string().describe("author's display name"),
          username: z.string().describe("author's @ handle"),
        }),
        { selector: ARTICLE_SELECTOR },
      );

      const media: MediaItem[] = [];

      // 圖片：擷取貼文圖片（pbs.twimg.com/media/...），排除頭像與 emoji
      try {
        const imageDatas = await stagehand.extract(
          "Extract all post image URLs from the tweet media (pbs.twimg.com/media). Exclude avatars, profile pictures and emoji.",
          z.object({ links: z.array(z.string()) }),
          { selector: ARTICLE_SELECTOR },
        );
        for (const link of imageDatas.links) {
          if (/pbs\.twimg\.com\/media\//i.test(link)) {
            media.push({ type: "image", url: link });
          }
        }
      } catch {
        console.warn("[jumo-x] 無法擷取圖片連結，略過");
      }

      // 影片：DOM 只有 blob/HLS，退而取 <video> poster 縮圖當預覽圖
      try {
        const poster = await page.evaluate(() => {
          const v = document.querySelector(
            'article[tabindex="-1"] video[poster]',
          ) as HTMLVideoElement | null;
          return v?.poster ?? null;
        });
        if (poster) media.push({ type: "image", url: poster });
      } catch {
        console.warn("[jumo-x] 無法擷取影片縮圖，略過");
      }

      return { ...metadata, media };
    } catch (error) {
      console.error("[jumo-x] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  },
);
