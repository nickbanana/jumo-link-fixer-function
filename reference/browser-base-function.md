> ## Documentation Index
> Fetch the complete documentation index at: https://docs.browserbase.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Functions

> Deploy browser agents and automations with Browserbase

<CardGroup cols={2}>
  <Card title="Functions reference" icon="code" href="/platform/runtime/reference">
    API reference for invoking, managing, and monitoring Browserbase Functions.
  </Card>

  <Card title="Deploy from playground" icon="play" href="/platform/runtime/deploy-from-playground">
    Deploy agents and automations directly from the Browserbase Playground.
  </Card>
</CardGroup>

## Overview

Functions let you deploy browser agents or automation scripts directly onto Browserbase's infrastructure. Start in your local environment, configure agents or write browser scripts, test them instantly, and deploy directly as cloud functions invokable as APIs.

**Examples:**

1. [Playwright script](#example-with-playwright)
2. [Stagehand Agent (AI SDK)](#example-with-agents)
3. [Deployed Claude Code browser agent](#deploy-claude-code)

**Key benefits:**

* **Zero infrastructure** - No servers to manage or containers to configure
* **Instant testing** - Local development server for rapid iteration
* **Run agents** - Full serverless sandbox execution environments
* **Playwright native** - Use familiar Playwright APIs for browser automation
* **Built-in browser management** - Sessions are automatically created and configured
* **API-first** - Invoke functions via simple HTTP requests

<Card title="Quick start" icon="rocket" href="/platform/browser/getting-started/deploying-browser-session">
  Ready to deploy? Follow the step-by-step guide to deploy your first Function.
</Card>

<Warning>
  Functions are currently only available in the **us-west-2** region.
</Warning>

## Getting started

The easiest way to get started is using the CLI to scaffold a new project:

```bash  theme={null}
pnpm dlx @browserbasehq/sdk-functions init my-functions-project
cd my-functions-project
```

This creates a ready-to-use project with:

* A configured `package.json` with required dependencies
* A `tsconfig.json` for TypeScript support
* A template `.env` file for your credentials
* A starter `index.ts` file with an example function

Add your Browserbase credentials to the `.env` file:

```bash  theme={null}
BROWSERBASE_PROJECT_ID=your_project_id
BROWSERBASE_API_KEY=your_api_key
```

<Info>
  Get your API key and Project ID from the [Browserbase Dashboard Settings](https://www.browserbase.com/settings).
</Info>

## Defining Functions

### Basic Function

```typescript  theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("function-name", async (ctx, params) => {
  const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
  const context = browser.contexts()[0];
  const page = context?.pages()[0];

  // Your agent or automation code here

  return { result: "your data" };
});
```

### Function parameters

* **Function Name** - Unique identifier for your function (used in the "invoke function" HTTP request)
* **Handler** - Async function that receives:
  * `ctx` - Context object with session information
  * `params` - Parameters passed when invoking the function
* **Options** - Optional configuration object for session settings

<Warning>
  Make sure that you give each function in your codebase a unique name! Function names are unique per project.
  The `name` parameter serves as a function's "Logical ID" (a *unique, human-friendly identifier*), meaning
  reusing a `name` string could lead to overwriting an existing built function with the same name.
</Warning>

### Context object

The `ctx` parameter provides access to the browser session:

```typescript  theme={null}
{
  session: {
    connectUrl: string;  // CDP connection URL
    id: string;          // Session ID
  }
}
```

### Function response

Return any JSON-serializable data from your function:

```typescript  theme={null}
return {
  success: true,
  data: { ... },
  message: "Operation complete"
};
```

### Session configuration

Configure browser session settings using the third parameter:

```typescript  theme={null}
defineFn(
  "verified-function",
  async (ctx, params) => {
    // Your function code
  },
  {
    sessionConfig: {
      browserSettings: {
        verified: true,
        solveCaptchas: true,
      },
      proxies: true,
    },
  }
);
```

<Info>
  Most session creation options are supported in `sessionConfig`. See the [Create Session API Reference](/reference/api/create-a-session) for the full list of available options including proxies, Verified, viewports, contexts, and extensions.
</Info>

### Example with Playwright

Here's a full example that fills out a contact form:

```typescript  theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn(
  "fill-contact-form",
  async (ctx, params) => {
    const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
    const context = browser.contexts()[0];
    const page = context?.pages()[0];

    if (!page) {
      console.error("Failed to create a page");
      return { error: "No page available" };
    }

    try {
      // Navigate to the contact page
      await page.goto("https://www.browserbase.com/contact");

      // Fill out the form
      await page.locator("#firstName").fill("Browser");
      await page.locator("#lastName").fill("Functions");
      await page.locator("#email-label").fill("demo@browserbase.com");
      await page.locator("#jobTitle-label").fill("Professional robot");
      await page.locator("#companyName-label").fill("Browserbase");

      // Select an option from dropdown
      await page.locator("button#helpOption").click();
      await page.locator("#helpOption-demo").click();

      return {
        success: true,
        message: "Form filled successfully"
      };
    } catch (error: unknown) {
      console.error("Error filling form:", error);
      return {
        error: "Failed to fill form",
        details: String(error)
      };
    }
  },
  {
    sessionConfig: {
      browserSettings: {
        verified: true,
      },
    },
  }
);
```

### Example with agents

Here's an example that uses [Stagehand Agent](https://docs.stagehand.dev/v3/basics/agent) to deploy a browser agent on Browserbase Functions:

```typescript  theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { Stagehand, type ModelConfiguration } from "@browserbasehq/stagehand";
import { z } from "zod";

defineFn(
  "run-agent",
  async (ctx, params) => {
    const session = ctx.session;

    const stagehand = new Stagehand({
      modelClientOptions: {
        modelName: params.model ?? "google/gemini-3-flash-preview",
      },
      env: "LOCAL",
      localBrowserLaunchOptions: {
        cdpUrl: session.connectUrl,
      },
      experimental: true,
    });

    await stagehand.init();

    const agent = stagehand.agent({
      mode: "hybrid",
      model: params.model ?? "google/gemini-3-flash-preview",
    });

    await agent.execute({
      instruction: params.instructions,
      maxSteps: params.maxSteps ?? 20,
    });
  },
  {
    parametersSchema: z.object({
      instructions: z.string(),
      maxSteps: z.number().optional(),
      model: z.string() satisfies z.ZodType<ModelConfiguration>,
    }),
  }
);
```

### Deploy Claude Code

Here's an example that deploys Claude Code using Anthropic [Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) as a browser agent on Browserbase Functions:

```typescript  theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { query } from "@anthropic-ai/claude-agent-sdk";

defineFn("my-function", async (context, params) => {
  const { session } = context;
  const { task, modelApiKey } = params;

  console.log("Connecting to browser session:", session.id);

  let result: string | undefined;

  for await (const message of query({
    prompt: task,
    options: {
      env: {
        ...process.env,
        ...(modelApiKey ? { ANTHROPIC_API_KEY: modelApiKey } : {}),
      },
      allowedTools: ["WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
      mcpServers: {
        playwright: {
          command: "npx",
          args: [
            "@playwright/mcp@latest",
            "--cdp-endpoint",
            session.connectUrl,
          ],
        },
      },
    },
  })) {
    if ("result" in message) {
      result = message.result;
    }
  }

  return {
    message: "Task completed",
    timestamp: new Date().toISOString(),
    result,
  };
});
```

<Warning>
  Currently, sandboxed directories such as `/tmp` are not guaranteed to be cleared and unique per invocation. Keep this in mind if you are deploying Functions where each invocation is expected to have full end-user data isolation. Please talk to us at [support@browserbase.com](mailto:support@browserbase.com) if you'd like to be notified when we remove this limitation.
</Warning>

## Local development

Before publishing, you can test your functions locally using the development server. This creates real Browserbase sessions using your credentials, ensuring your function behaves the same locally and in production.

### Start the development server

```bash  theme={null}
pnpm bb dev index.ts
```

The local server starts on `http://127.0.0.1:14113` and watches for file changes, automatically reloading when you modify your function files.

### Invoke Functions locally

Use curl to test your function against the local development server:

```bash  theme={null}
curl -X POST http://127.0.0.1:14113/v1/functions/my-function/invoke \
  -H "Content-Type: application/json"
```

Replace `my-function` with your function's name (the first parameter passed to `defineFn`).

### Pass parameters locally

Pass parameters to your function using the request body:

```bash  theme={null}
curl -X POST http://127.0.0.1:14113/v1/functions/my-function/invoke \
  -H "Content-Type: application/json" \
  -d '{"params": {"url": "https://example.com", "selector": "#content"}}'
```

Access these parameters in your function handler via the `params` argument:

```typescript  theme={null}
defineFn("my-function", async (ctx, params) => {
  const { url, selector } = params;
  // Use parameters in your automation
});
```

<Tip>
  Pipe the curl output to [jq](https://github.com/jqlang/jq) for human-readable JSON formatting:

  ```bash  theme={null}
  curl -X POST http://127.0.0.1:14113/v1/functions/my-function/invoke \
    -H "Content-Type: application/json" | jq
  ```
</Tip>

<Info>
  The local development server runs your function synchronously and returns the result directly in the HTTP response. This differs from production, where invocations are asynchronous and require polling for results.
</Info>

## Publishing Functions

### Multiple Functions (single file)

Define multiple functions in a single file:

```typescript index.ts theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

// Function 1: Screenshot
defineFn("take-screenshot", async (ctx, params) => {
  const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
  const page = browser.contexts()[0]?.pages()[0];

  await page.goto(params.url);
  const screenshot = await page.screenshot({ encoding: "base64" });

  return { screenshot };
});

// Function 2: Extract Text
defineFn("extract-text", async (ctx, params) => {
  const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
  const page = browser.contexts()[0]?.pages()[0];

  await page.goto(params.url);
  const text = await page.textContent(params.selector);

  return { text };
});
```

Both Functions will be deployed when you run `pnpm bb publish index.ts`.

<Note>
  The `publish` command requires an "entrypoint" parameter. An entrypoint file indicates that all functions in this
  project are either defined in this file or defined in files directly or indirectly imported into this file.
</Note>

### Multiple Functions (multiple files)

Define multiple functions in multiple files:

```typescript index.ts theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

import "screenshot-fn.ts"
// Import any other files that contain `defineFn` calls in the same way

// Function 1: Screenshot
defineFn("take-screenshot", async (ctx, params) => {
  const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
  const page = browser.contexts()[0]?.pages()[0];

  await page.goto(params.url);
  const screenshot = await page.screenshot({ encoding: "base64" });

  return { screenshot };
});
```

```typescript screenshot-fn.ts theme={null}
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

// Function 2: Extract Text
defineFn("extract-text", async (ctx, params) => {
  const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
  const page = browser.contexts()[0]?.pages()[0];

  await page.goto(params.url);
  const text = await page.textContent(params.selector);

  return { text };
});
```

Both Functions will be deployed when you run `pnpm bb publish index.ts`.

## Invoke a Function

### Get build result

Retrieve information about the Function(s) built or updated by a build:

```bash  theme={null}
curl https://api.browserbase.com/v1/functions/builds/BUILD_ID \
  -H "x-bb-api-key: $BB_API_KEY"
```

This returns Function ID(s) needed for invocation.

### Pass parameters to Functions

Access parameters in your function handler:

```typescript  theme={null}
defineFn("parameterized-function", async (ctx, params) => {
  const { url, searchTerm } = params;

  // Use parameters in your automation
  await page.goto(url);
  await page.fill("#search", searchTerm);

  return { searched: searchTerm };
});
```

Invoke with parameters:

```bash  theme={null}
curl -X POST https://api.browserbase.com/v1/functions/FUNCTION_ID/invoke \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: $BB_API_KEY" \
  -d '{
    "params": {
      "url": "https://example.com",
      "searchTerm": "browser automation"
    }
  }'
```

### Async invocation

Function invocations are async. While an invocation is running, you can poll for completion:

```bash  theme={null}
curl --request GET \
     --url https://api.browserbase.com/v1/functions/invocations/YOUR_INVOCATION_ID \
     --header 'Content-Type: application/json' \
     --header 'x-bb-api-key: $BB_API_KEY'
```

Once complete, the response includes your function's results:

```json  theme={null}
{
  "id": "00000000-0000-0000-0000-000000000000",
  "functionId": "00000000-0000-0000-0000-000000000000",
  "sessionId": "00000000-0000-0000-0000-000000000000",
  "status": "COMPLETED",
  "params": {},
  "results": {
    "success": true,
    "data": { ... }
  },
  "createdAt": "2026-01-01T00:00:00.000000+00:00",
  "endedAt": "2026-01-01T00:00:00.000000+00:00"
}
```

## Best practices

### Error handling

Unhandled errors are caught by the runners and reported as an error. If you want to gracefully
handle your errors (for example, return information on the failure), wrap your automation code in try-catch blocks:

```typescript  theme={null}
defineFn("safe-function", async (ctx, params) => {
  try {
    const browser = await chromium.connectOverCDP(ctx.session.connectUrl);
    const page = browser.contexts()[0]?.pages()[0];

    // Your automation code

    return { success: true };
  } catch (error) {
    console.error("Function error:", error);
    return {
      success: false,
      error: String(error)
    };
  }
});
```

### Logging

Use console methods for debugging - logs are captured and available in invocation logs:

```typescript  theme={null}
console.log("Starting navigation to:", url);
console.warn("Potential issue detected:", warning);
console.error("Critical error:", error);
```

### Session cleanup

Browser sessions automatically close when your function completes. No manual cleanup is required.

## Monitoring and debugging

Every Function invocation creates a browser session that you can inspect as with any other Browserbase session:

1. **Session recordings** - View the function execution in the [Session Inspector](/platform/browser/observability/observability)
2. **Console logs** - See all logged messages during execution
3. **Network activity** - Inspect HTTP requests and responses
4. **Performance metrics** - Monitor execution time and resource usage

<Card title="Session recordings" icon="circle-play" iconType="sharp-solid" href="/platform/browser/observability/session-recording">
  Learn how to debug Functions using session recordings
</Card>

## Limitations

* Maximum execution time: 15 minutes
* No persistent storage between invocations
* TypeScript only (no Python support)
* Custom NPM packages must be bundled with your code (private NPM packages aren't supported)

## Secrets

Secrets management for Functions environments is coming soon! You'll be able to securely store and access sensitive values like API keys, tokens, and credentials within your deployed Functions without passing them as parameters.

<Info>
  Availability: Support for Secrets is a top priority on the current roadmap.
  This feature isn't yet available in beta. Email [support@browserbase.com](mailto:support@browserbase.com) to get
  on the waitlist.
</Info>

## Next steps

<CardGroup cols={2}>
  <Card title="Session configuration" icon="gear" iconType="sharp-solid" href="/platform/browser/getting-started/create-browser-session">
    Learn about all available session configuration options
  </Card>

  <Card title="Verified" icon="user-secret" iconType="sharp-solid" href="/platform/identity/overview">
    Configure browser identity for your functions
  </Card>

  <Card title="Browser contexts" icon="layer-group" iconType="sharp-solid" href="/platform/browser/core-features/contexts">
    Persist authentication and session state
  </Card>

  <Card title="API reference" icon="book" iconType="sharp-solid" href="/reference/api/overview">
    Complete Browserbase API documentation
  </Card>
</CardGroup>


Built with [Mintlify](https://mintlify.com).