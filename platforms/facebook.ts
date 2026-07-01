import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult, type MediaItem } from "../shared.ts";

// CDP Network.responseReceived 事件的精簡型別（避免額外引入 devtools-protocol）
type NetworkResponseReceived = {
  response?: { url?: string; mimeType?: string };
};

defineFn(
  "jumo-facebook",
  async (ctx, params) => {
    const { url } = params;

    console.log(`[jumo-facebook] 擷取內容: ${url}`);

    try {
      const stagehand = await initStagehand(ctx.session.connectUrl, params.apiKey);
      const page = stagehand.context.pages()[0]!;

      // 影片網路攔截：FB 影片在 DOM 僅有 blob，真正的 mp4 走 fbcdn 網路請求。
      // 透過 CDP Network domain 監聽（Stagehand Page 的 on() 僅支援 "console"）。
      // 依 pathname 去重（同一支影片會有多段 range 請求）。
      // 保留完整 query string —— fbcdn URL 帶簽章參數（oh=/oe=/bytestart= 等），去掉會 403。
      const videoUrls = new Map<string, string>();
      try {
        const session = page.getSessionForFrame(page.mainFrameId());
        session.on<NetworkResponseReceived>("Network.responseReceived", ({ response }) => {
          try {
            const u = response?.url;
            const mime = response?.mimeType ?? "";
            if (!u || !/fbcdn\.net/i.test(u)) return;
            if (!/\.mp4/i.test(u) && !mime.includes("video/mp4")) return;
            const pathname = new URL(u).pathname;
            if (!videoUrls.has(pathname)) videoUrls.set(pathname, u);
          } catch {
            // 忽略無法解析的 URL
          }
        });
        await page.sendCDP("Network.enable");
      } catch {
        console.warn("[jumo-facebook] 無法啟用網路攔截，影片將退回縮圖");
      }

      await page.goto(url);

      // 嘗試關閉登入彈窗
      try {
        await stagehand.act("close any login or registration modals or overlays");
      } catch {
        console.warn("[jumo-facebook] 無法關閉登入彈窗，繼續執行");
      }

      // 嘗試關閉 Cookie 同意 banner
      try {
        await stagehand.act("accept or dismiss the cookie consent banner if present");
      } catch {
        console.warn("[jumo-facebook] 無法處理 Cookie banner，繼續執行");
      }

      // 貼文正規永久連結與 og:video：分享連結（/share/p/…）導航後會被 FB 重導，
      // 故 canonical / og:url / 最終 URL 才是真正的貼文連結，勿沿用進來的 share URL。
      let permalink = url;
      let ogVideo: string | null = null;
      try {
        const head = await page.evaluate(() => {
          const canonical = document
            .querySelector('link[rel="canonical"]')
            ?.getAttribute("href");
          const ogUrl = document
            .querySelector('meta[property="og:url"]')
            ?.getAttribute("content");
          const video =
            document
              .querySelector('meta[property="og:video:secure_url"]')
              ?.getAttribute("content") ??
            document.querySelector('meta[property="og:video:url"]')?.getAttribute("content") ??
            document.querySelector('meta[property="og:video"]')?.getAttribute("content");
          return { permalink: canonical || ogUrl || null, video: video || null };
        });
        permalink = head.permalink || page.url() || url;
        ogVideo = head.video;
      } catch {
        permalink = page.url() || url;
      }

      // 擷取貼文 metadata（不含 engagement）
      const metadata = await stagehand.extract(
        "Extract the post text (first 70 words) and the author name",
        z.object({
          content: z.string().describe("the post text"),
          author: z.string().describe("the author or page name"),
        }),
      );

      const media: MediaItem[] = [];

      // 圖片：擷取 fbcdn 貼文圖片，排除頭像/大頭貼/emoji/reaction icon（保留 query）
      try {
        const imageDatas = await stagehand.extract(
          "Extract all post image URLs from fbcdn.net. Exclude avatars, profile pictures, emoji and reaction icons.",
          z.object({ links: z.array(z.string()) }),
        );
        for (const link of imageDatas.links) {
          if (/fbcdn\.net/i.test(link)) {
            media.push({ type: "image", url: link });
          }
        }
      } catch {
        console.warn("[jumo-facebook] 無法擷取圖片連結，略過");
      }

      // 影片：優先用 og:video 的直接 mp4，其次用攔截到的 fbcdn mp4；
      // 兩者都沒有才退而取 <video> poster 縮圖。
      const videoLinks = new Set<string>();
      if (ogVideo && /\.mp4/i.test(ogVideo)) videoLinks.add(ogVideo);
      for (const u of videoUrls.values()) videoLinks.add(u);

      if (videoLinks.size > 0) {
        for (const u of videoLinks) {
          media.push({ type: "video", url: u });
        }
      } else {
        try {
          const poster = await page.evaluate(() => {
            const v = document.querySelector("video[poster]") as HTMLVideoElement | null;
            return v?.poster ?? null;
          });
          if (poster) media.push({ type: "image", url: poster });
        } catch {
          console.warn("[jumo-facebook] 無法擷取影片縮圖，略過");
        }
      }

      return { ...metadata, permalink, media };
    } catch (error) {
      console.error("[jumo-facebook] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  }
);
