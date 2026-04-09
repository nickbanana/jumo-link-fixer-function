#!/usr/bin/env node

/**
 * 從 Browserbase API 取得最新 build 的 function IDs，
 * 並更新到 jumo-link-fixer 的環境變數。
 *
 * 用法：
 *   node scripts/update-function-ids.mjs --local   # 更新 ../jumo-link-fixer/wrangler.jsonc
 *   node scripts/update-function-ids.mjs --remote  # 更新 CF Worker production secrets
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 設定 ----------
const BB_API_BASE = 'https://api.browserbase.com/v1';
const WORKER_NAME = 'jumo-link-fixer';
const WRANGLER_JSONC = resolve(__dirname, '../../jumo-link-fixer/wrangler.jsonc');

// Function name → 環境變數 mapping
const NAME_TO_VAR = {
    'jumo-x': 'JUMO_X_FUNCTION_ID',
    'jumo-instagram': 'JUMO_IG_FUNCTION_ID',
    'jumo-threads': 'JUMO_THREADS_FUNCTION_ID',
    'jumo-facebook': 'JUMO_FB_FUNCTION_ID',
};

// ---------- 驗證 ----------
const apiKey = process.env.BROWSERBASE_API_KEY;
if (!apiKey) {
    console.error('Error: BROWSERBASE_API_KEY is not set');
    process.exit(1);
}

const mode = process.argv[2] || '--local';
if (mode !== '--local' && mode !== '--remote') {
    console.error('Usage: node scripts/update-function-ids.mjs [--local|--remote]');
    process.exit(1);
}

// ---------- API helper ----------
async function bbFetch(path) {
    const res = await fetch(`${BB_API_BASE}${path}`, {
        headers: { 'x-bb-api-key': apiKey },
    });
    if (!res.ok) {
        throw new Error(`Browserbase API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

// ---------- 主流程 ----------
async function main() {
    // 取得 builds 列表（回傳 { data: [...], total }）
    console.log('Fetching builds from Browserbase API...');
    const response = await bbFetch('/functions/builds');
    const builds = response.data;

    if (!Array.isArray(builds) || builds.length === 0) {
        console.error('Error: No builds found');
        process.exit(1);
    }

    const latestBuild = builds[0];
    console.log(`Latest build ID: ${latestBuild.id} (status: ${latestBuild.status})`);

    // 從 builtFunctions 取得 function IDs
    const builtFunctions = latestBuild.builtFunctions || [];
    const functionIds = {};

    for (const [name, varName] of Object.entries(NAME_TO_VAR)) {
        const fn = builtFunctions.find(f => f.name === name);
        if (fn) {
            functionIds[varName] = fn.id;
            console.log(`  ${name} -> ${fn.id}`);
        } else {
            console.log(`  ${name} -> (not found in build, skipping)`);
        }
    }

    if (Object.keys(functionIds).length === 0) {
        console.error('Error: No function IDs found in build');
        process.exit(1);
    }

    // 更新目標
    if (mode === '--local') {
        console.log(`\nUpdating ${WRANGLER_JSONC}...`);

        let content = readFileSync(WRANGLER_JSONC, 'utf-8');

        for (const [varName, varValue] of Object.entries(functionIds)) {
            const pattern = new RegExp(`("${varName}":\\s*)"[^"]*"`, 'g');
            content = content.replace(pattern, `$1"${varValue}"`);
            console.log(`  Updated ${varName} = ${varValue}`);
        }

        writeFileSync(WRANGLER_JSONC, content, 'utf-8');
        console.log('Done! wrangler.jsonc updated.');

    } else if (mode === '--remote') {
        console.log('\nUpdating CF Worker production secrets...');

        const secretJson = JSON.stringify(functionIds);
        execSync(`echo '${secretJson}' | npx wrangler secret bulk --name ${WORKER_NAME}`, {
            stdio: 'inherit',
            shell: true,
        });

        console.log('Done! CF Worker production secrets updated.');
    }

    // Summary
    console.log('\n=== Function ID Summary ===');
    for (const [varName, varValue] of Object.entries(functionIds)) {
        console.log(`  ${varName} = ${varValue}`);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
