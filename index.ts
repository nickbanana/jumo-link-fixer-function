import { defineFn } from "@browserbasehq/sdk-functions";
import { z } from "zod";

// Run locally: bb dev index.ts
// Deploy:      bb publish index.ts

const paramsSchema = z.object({
  url: z.url(),
});

defineFn(
  "jumo-link-fixer",
  async (context, params) => {
    const { session } = context;
    const { url } = params;

    console.log(`Connecting to browser session: ${session.id}`);
    console.log(`Fetching content for: ${url}`);

    // Use LOCAL env with the CDP URL provided by Browserbase Function runtime
    // This avoids Stagehand creating a duplicate session
    const stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        cdpUrl: session.connectUrl,
      },
      modelName: "google/gemini-2.5-pro",
      modelClientOptions: {
        apiKey: process.env.GOOGLE_API_KEY,
      },
    });
    await stagehand.init();
    const page = stagehand.page;

    await page.goto(url);
    await page.act("close the modal which prompt login or register");

    const metadata = await page.extract({
      instruction:
        "Extract first 70 words of main post article, main author's user id, like count",
      schema: z.object({
        content: z.string(),
        likes: z.number(),
        author: z.string(),
      }),
    });

    const medias = await page.observe(
      "find the main carousel, at the main article"
    );
    console.log(medias);

    const mediaDatas = await page.extract({
      instruction: "Extract all images url",
      schema: z.object({
        links: z.array(z.string()),
      }),
      selector: medias[0].selector,
    });

    return { ...metadata, ...mediaDatas };
  },
  {
    parametersSchema: paramsSchema,
  }
);
