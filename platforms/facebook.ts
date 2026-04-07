import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult } from "../shared.ts";

defineFn(
  "jumo-facebook",
  async (ctx, params) => {
    const { url } = params;

    console.log(`[jumo-facebook] 擷取內容: ${url}`);

    try {
      const stagehand = await initStagehand(ctx.session.connectUrl);
      const page = stagehand.context.pages()[0]!;
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

      // 擷取貼文 metadata
      const metadata = await stagehand.extract(
        "Extract the post text (first 70 words), author name, reaction count as likes",
        z.object({
          content: z.string(),
          likes: z.number(),
          author: z.string(),
        }),
      );

      // 擷取貼文中的媒體 URL
      let links: string[] = [];
      try {
        const mediaDatas = await stagehand.extract(
          "Extract all image and video URLs from the post",
          z.object({
            links: z.array(z.string()),
          }),
        );
        links = mediaDatas.links;
      } catch {
        console.warn("[jumo-facebook] 無法擷取媒體連結，回傳空陣列");
      }

      return { ...metadata, links };
    } catch (error) {
      console.error("[jumo-facebook] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  }
);
