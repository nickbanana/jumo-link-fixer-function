# Jumo Link Fixer Function - AI 助理開發指南

這是一個部署在 Browserbase Functions 平台上的專案，使用 Stagehand 與 Playwright 進行瀏覽器自動化操作，主要任務是繞過社群平台的登入牆，並擷取用於 Open Graph (OG) 標籤的 Metadata 與媒體連結。

## 🛠️ 常用指令

- **安裝依賴**: `pnpm install`
- **本地開發測試**: `bb dev index.ts` (需要安裝 Browserbase CLI)
- **部署上線**: `bb publish index.ts`

## 📚 技術堆疊

- **執行環境**: Browserbase Functions
- **瀏覽器自動化**: Stagehand + Playwright
- **資料驗證**: Zod
- **套件管理**: pnpm

## 🧑‍💻 程式碼風格與開發規範

### 1. 基本守則
- 一律使用 **TypeScript strict mode**。
- 偏好使用 ESNext 語法（例如：async/await, optional chaining `?.`, nullish coalescing `??`）。
- 註解與開發文件請使用 **繁體中文**。

### 2. Stagehand 操作守則
- 必須透過 `defineFn()` 進入點來定義 Function 邏輯。
- 使用 `page.act()` 處理關閉登入彈窗、點擊「展開更多」等互動操作。提示詞 (prompt) 必須寫得夠通用，以容忍社群平台 UI 的微調。
- 使用 `page.extract()` 搭配 **Zod Schema** 來嚴格定義與擷取文章的 metadata (作者、內容、按讚數等)。
- 使用 `page.observe()` 來定位複雜元素，例如 IG 的圖片輪播按鈕。

### 3. 架構與安全性
- **單一入口、各平台分檔**：`index.ts` 為入口點，以 side-effect import 匯入各平台 function（位於 `platforms/` 目錄）。共用邏輯（Stagehand 初始化、Schema、fallback）集中於 `shared.ts`。
- **Function 命名規則**：各平台 function 名稱為 `jumo-{platform}`，例如 `jumo-instagram`、`jumo-x`、`jumo-threads`、`jumo-facebook`。
- **避免硬編碼**：絕不在程式碼中寫死任何 API Key (`BROWSERBASE_API_KEY`, `GOOGLE_API_KEY` 等皆須從平台環境變數注入)。
- **Connection 設定**：初始化 Stagehand 時，Browserbase Function 會自動處理連線，請依賴平台預設的 CDP URL，避免重複建立非必要的 session。

### 4. 錯誤處理與容錯
- 社群平台（尤其是 Meta 體系）的反爬蟲機制與 DOM 變化頻繁，執行瀏覽器操作時必須包裝妥善的 `try-catch` 區塊。
- 當 `page.extract()` 失敗或部分欄位找不到時，應設計合理的 fallback 值（例如回傳空字串或預設圖片），避免整個 Function 崩潰。
- Function 的回傳值必須是一個標準化的 JSON 物件：`{ content: string, likes: number, author: string, links: string[] }`。

## 📖 參考文件

- **Browserbase Functions 官方文件**：`reference/browser-base-function.md` — 涵蓋 Function 定義、本地開發、部署、Session 設定、錯誤處理等完整說明。遇到 Browserbase 相關問題時請優先查閱此文件。