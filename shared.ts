import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

// 各平台共用的參數 Schema
export const paramsSchema = z.object({
  url: z.url(),
  apiKey: z.string().optional(),
});

// 標準化回傳型別
export type ResultType = {
  content: string;
  likes: number;
  author: string;
  links: string[];
};

// 擷取失敗時的預設回傳值
export const fallbackResult: ResultType = {
  content: "",
  likes: 0,
  author: "",
  links: [],
};

// 初始化 Stagehand，封裝 CDP 連線與 AI model 設定
export async function initStagehand(cdpUrl: string, apiKey?: string) {
  const stagehand = new Stagehand({
    model: apiKey
      ? { modelName: "google/gemini-3-flash-preview", apiKey }
      : "google/gemini-3-flash-preview",
    env: "LOCAL",
    localBrowserLaunchOptions: {
      cdpUrl,
    },
  });
  await stagehand.init();

  return stagehand;
}
