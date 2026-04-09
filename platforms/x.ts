import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult } from "../shared.ts";

defineFn(
  "jumo-x",
  async (ctx, params) => {
    const { url } = params;

    console.log(`[jumo-x] 擷取內容: ${url}`);

    try {
      const stagehand = await initStagehand(ctx.session.connectUrl, params.apiKey);
      const page = stagehand.context.pages()[0]!;
      await page.goto(url, { waitUntil: "domcontentloaded"});

      // // 嘗試關閉登入提示（banner 不影響擷取，暫時停用避免卡住）
      // try {
      //   await stagehand.act("close or dismiss any login prompts or banners");
      // } catch {
      //   console.warn("[jumo-x] 無法關閉登入提示，繼續執行");
      // }

      // 擷取推文 metadata
      const metadata = await stagehand.extract(
        "Extract the tweet text (first 70 words), author's display name and author's @ handle",
        z.object({
          content: z.string().describe('the tweet text'),
          author: z.string().describe('author\'s display name'),
          username: z.string().describe('author\'s @ handle'),
        }),
        {
          selector: 'xpath=//article[@tabindex="-1"]'
        }
      );

      // 擷取推文中的媒體 URL
      let links: string[] = [];
      try {
        const mediaDatas = await stagehand.extract(
          "Extract all media (image and video) URLs from the tweet",
          z.object({
            links: z.array(z.string()),
          }),
        );
        links = mediaDatas.links;
      } catch {
        console.warn("[jumo-x] 無法擷取媒體連結，回傳空陣列");
      }

      return { ...metadata, links };
    } catch (error) {
      console.error("[jumo-x] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  }
);
