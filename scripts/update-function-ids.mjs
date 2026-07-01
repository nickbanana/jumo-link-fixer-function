#!/usr/bin/env node

/**
 * 從 Browserbase API 取得最新 build 的 function IDs，
 * 並更新到 jumo-link-fixer 的環境變數。
 *
 * 用法：
 *   node scripts/update-function-ids.mjs --local   # 更新 ../jumo-link-fixer/.dev.vars
 *   node scripts/update-function-ids.mjs --remote  # 更新 CF Worker secrets
 *
 * 註：JUMO_*_FUNCTION_ID 以 CF secret 管理，不再放在 wrangler.jsonc 的 vars
 *     （同名不能同時是 var 與 secret，否則 secret bulk 會失敗）。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 設定 ----------
const BB_API_BASE = 'https://api.browserbase.com/v1';
const WORKER_NAME = 'jumo-link-fixer';
const DEV_VARS = resolve(__dirname, '../../jumo-link-fixer/.dev.vars');

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
        console.log(`\nUpdating ${DEV_VARS}...`);

        let content = '';
        try {
            content = readFileSync(DEV_VARS, 'utf-8');
        } catch {
            // .dev.vars 不存在時從空檔案開始
        }
        // 保留原本結尾換行狀態，統一以 \n 處理
        let lines = content.length ? content.replace(/\r\n/g, '\n').split('\n') : [];

        for (const [varName, varValue] of Object.entries(functionIds)) {
            const idx = lines.findIndex(l => l.startsWith(`${varName}=`));
            const line = `${varName}=${varValue}`;
            if (idx >= 0) {
                lines[idx] = line;
            } else {
                // 去掉尾端空行後再 append，避免累積空白
                while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
                lines.push(line);
            }
            console.log(`  Updated ${varName} = ${varValue}`);
        }

        writeFileSync(DEV_VARS, lines.join('\n') + '\n', 'utf-8');
        console.log('Done! .dev.vars updated.');

    } else if (mode === '--remote') {
        console.log('\nUpdating CF Worker secrets...');

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
