import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

// 各平台共用的參數 Schema
export const paramsSchema = z.object({
  url: z.url(),
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
export async function initStagehand() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: 'google/gemini-3.1-pro-preview',
  });
  await stagehand.init();

  return stagehand;
}
