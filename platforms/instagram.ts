import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";
import { initStagehand, paramsSchema, fallbackResult } from "../shared.ts";

defineFn(
  "jumo-instagram",
  async (_context, params) => {
    const { url } = params;

    console.log(`[jumo-instagram] 擷取內容: ${url}`);

    try {
      const stagehand = await initStagehand();
      const page = stagehand.context.pages()[0]!;
      await page.goto(url);

      // 嘗試關閉登入彈窗
      try {
        await stagehand.act("close the modal which prompt login or register");
      } catch {
        console.warn("[jumo-instagram] 無法關閉登入彈窗，繼續執行");
      }

      // 擷取文章 metadata
      const metadata = await stagehand.extract(
        "Extract first 70 words of main post article, main author's user id, like count",
        z.object({
          content: z.string(),
          likes: z.number(),
          author: z.string(),
        }),
      );

      // 定位輪播元素並擷取圖片 URL
      let links: string[] = [];
      try {
        const medias = await stagehand.observe(
          "find the main carousel, at the main article"
        );

        if (medias.length > 0) {
          const mediaDatas = await stagehand.extract(
            "Extract all images url",
            z.object({
              links: z.array(z.string()),
            }),
            { selector: medias[0]!.selector },
          );
          links = mediaDatas.links;
        }
      } catch {
        console.warn("[jumo-instagram] 無法擷取輪播圖片，回傳空陣列");
      }

      return { ...metadata, links };
    } catch (error) {
      console.error("[jumo-instagram] 擷取失敗:", error);
      return fallbackResult;
    }
  },
  {
    parametersSchema: paramsSchema,
  }
);
