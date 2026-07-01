import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

// 各平台共用的參數 Schema
export const paramsSchema = z.object({
  url: z.url(),
  apiKey: z.string().optional(),
});

// 單一媒體項目：帶類型（圖片/影片）與可存取的 URL
export type MediaItem = { type: "image" | "video"; url: string };

// 標準化回傳型別
export type ResultType = {
  content: string;
  likes: number;
  author: string;
  media: MediaItem[];
};

// 擷取失敗時的預設回傳值
export const fallbackResult: ResultType = {
  content: "",
  likes: 0,
  author: "",
  media: [],
};

// 把純圖片 URL 陣列包成 MediaItem[]（皆視為 image）
export function toImageMedia(urls: string[]): MediaItem[] {
  return urls.map((url) => ({ type: "image", url }));
}

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
