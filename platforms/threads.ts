import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult } from "../shared.ts";

defineFn(
  "jumo-threads",
  async (_context, params) => {
    const { url } = params;

    console.log(`[jumo-threads] 擷取內容: ${url}`);

    try {
      const stagehand = await initStagehand();
      const page = stagehand.context.pages()[0]!;
      await page.goto(url);

      // 嘗試關閉登入彈窗（Meta 風格，同 Instagram）
      try {
        await stagehand.act("close the modal which prompt login or register");
      } catch {
        console.warn("[jumo-threads] 無法關閉登入彈窗，繼續執行");
      }

      // 擷取貼文 metadata
      const metadata = await stagehand.extract(
        "Extract the post content (first 70 words), author's username, like count",
        z.object({
          content: z.string(),
          likes: z.number(),
          author: z.string(),
        }),
      );

      // 擷取貼文中的圖片 URL
      let links: string[] = [];
      try {
        const mediaDatas = await stagehand.extract(
          "Extract all image URLs from the post",
          z.object({
            links: z.array(z.string()),
          }),
        );
        links = mediaDatas.links;
      } catch {
        console.warn("[jumo-threads] 無法擷取圖片連結，回傳空陣列");
      }

      return { ...metadata, links };
    } catch (error) {
      console.error("[jumo-threads] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  }
);
