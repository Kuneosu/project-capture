#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const { chromium } = await import("playwright");

const baseUrl = required(args["base-url"], "--base-url");
const routesFile = required(args.routes, "--routes");
const outputDir = args["output-dir"] || defaultOutputDir();
const scope = args.scope || "selected";
const authMode = args["auth-mode"] || "none";
const loginPath = args["login-path"] || "/login";
const headed = Boolean(args.headed) || authMode === "manual";
const timeout = Number(args.timeout || 30000);
const viewport = parseViewport(args.viewport || "1280x720");
const screenshotMode = normalizeScreenshotMode(args["screenshot-mode"] || (args["viewport-only"] ? "viewport" : "fullpage"));

await fs.mkdir(path.join(outputDir, "screenshots"), { recursive: true });

const inputRoutes = await readRoutes(routesFile, scope);
const routes = inputRoutes.filter((route) => !route.excluded && !route.sample_needed);
const skipped = inputRoutes.filter((route) => route.excluded || route.sample_needed);

const browser = await chromium.launch({ headless: !headed });
let context;
const storageStatePath = args["storage-state"];

if (storageStatePath && await exists(storageStatePath)) {
  context = await browser.newContext({ viewport, storageState: storageStatePath, ignoreHTTPSErrors: true });
} else {
  context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
}

const authResult = await resolveAuth(context, { authMode, baseUrl, loginPath, outputDir, timeout });
const results = [];

for (const route of routes) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`.trim());
  });

  const url = toUrl(baseUrl, route.path || route.url);
  const fileName = `${sanitizeName(route.name || route.path || route.url)}.png`;
  const screenshotPath = path.join(outputDir, "screenshots", fileName);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await settlePage(page, timeout);
    await page.screenshot({ path: screenshotPath, fullPage: screenshotMode === "fullpage" });
    results.push({
      status: "success",
      path: route.path || route.url,
      url,
      screenshot: path.relative(outputDir, screenshotPath),
      screenshotMode,
      consoleErrors: consoleErrors.slice(0, 10),
      failedRequests: failedRequests.slice(0, 10),
    });
  } catch (error) {
    results.push({
      status: "failed",
      path: route.path || route.url,
      url,
      reason: error.message,
      consoleErrors: consoleErrors.slice(0, 10),
      failedRequests: failedRequests.slice(0, 10),
    });
  } finally {
    await page.close().catch(() => {});
  }
}

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  scope,
  authMode,
  authResult,
  screenshotMode,
  viewport,
  totalInputRoutes: inputRoutes.length,
  capturedRoutes: results.filter((item) => item.status === "success").length,
  failedRoutes: results.filter((item) => item.status === "failed").length,
  skippedRoutes: skipped.map((route) => ({
    path: route.path || route.url,
    reason: route.sample_needed ? "sample_needed" : "excluded",
  })),
  results,
};

await fs.writeFile(path.join(outputDir, "capture-results.json"), JSON.stringify(report, null, 2) + "\n", "utf-8");
await fs.writeFile(path.join(outputDir, "capture-report.md"), renderMarkdown(report), "utf-8");
console.log(`캡처 완료: ${outputDir}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
    } else if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
node capture_pages.mjs --base-url http://localhost:3000 --routes routes.json --output-dir output/playwright/project-capture

Options:
  --base-url <url>          실행 중인 앱의 기준 URL
  --routes <file>           라우트 JSON 파일
  --scope <selected|static|core|all>
  --output-dir <dir>        결과 저장 디렉터리
  --auth-mode <none|manual|env>
  --login-path <path>       로그인 경로, 기본 /login
  --storage-state <file>    기존 Playwright storage state
  --screenshot-mode <mode>  fullpage 또는 viewport, 기본 fullpage
  --headed                  headed 브라우저 실행
  --viewport <WxH>          기본 1280x720
  --timeout <ms>            기본 30000`);
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} 값이 필요하다. --help를 확인한다.`);
  }
  return value;
}

function defaultOutputDir() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return path.join("output", "playwright", `project-capture-${stamp}`);
}

function parseViewport(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) return { width: 1280, height: 720 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function normalizeScreenshotMode(value) {
  const mode = String(value || "").toLowerCase().replace(/[-_]/g, "");
  if (["fullpage", "full"].includes(mode)) return "fullpage";
  if (["viewport", "visible", "screen"].includes(mode)) return "viewport";
  throw new Error("--screenshot-mode 값은 fullpage 또는 viewport여야 한다.");
}

async function readRoutes(file, scope) {
  const raw = JSON.parse(await fs.readFile(file, "utf-8"));
  let routes;
  if (Array.isArray(raw)) {
    routes = raw;
  } else if (scope === "core" && Array.isArray(raw.core_routes)) {
    routes = raw.core_routes;
  } else if (Array.isArray(raw.routes)) {
    routes = raw.routes;
  } else {
    throw new Error("라우트 JSON 형식을 해석할 수 없다.");
  }

  if (scope === "static" || scope === "selected") {
    return routes.filter((route) => !route.dynamic && !route.sample_needed && !route.excluded);
  }
  if (scope === "core") {
    return routes.filter((route) => !route.sample_needed && !route.excluded);
  }
  return routes;
}

async function resolveAuth(context, options) {
  if (options.authMode === "none") {
    return { status: "skipped" };
  }

  if (options.authMode === "manual") {
    const page = await context.newPage();
    await page.goto(toUrl(options.baseUrl, options.loginPath), { waitUntil: "domcontentloaded", timeout: options.timeout });
    const rl = readline.createInterface({ input, output });
    await rl.question("브라우저에서 로그인을 완료한 뒤 Enter를 누른다: ");
    rl.close();
    await saveStorageState(context, options.outputDir);
    await page.close().catch(() => {});
    return { status: "manual-completed" };
  }

  if (options.authMode === "env") {
    const username = process.env.CAPTURE_USER;
    const password = process.env.CAPTURE_PASSWORD;
    if (!username || !password) {
      throw new Error("CAPTURE_USER와 CAPTURE_PASSWORD 환경변수가 필요하다.");
    }
    const page = await context.newPage();
    await page.goto(toUrl(options.baseUrl, options.loginPath), { waitUntil: "domcontentloaded", timeout: options.timeout });
    await fillFirst(page, [
      process.env.CAPTURE_USER_SELECTOR,
      'input[type="email"]',
      'input[name*="email" i]',
      'input[id*="email" i]',
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[type="text"]',
    ], username);
    await fillFirst(page, [
      process.env.CAPTURE_PASSWORD_SELECTOR,
      'input[type="password"]',
      'input[name*="password" i]',
      'input[id*="password" i]',
    ], password);

    if (process.env.CAPTURE_OTP) {
      await fillFirst(page, [
        process.env.CAPTURE_OTP_SELECTOR,
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[name*="code" i]',
        'input[id*="code" i]',
      ], process.env.CAPTURE_OTP, false);
    }

    await clickFirst(page, [
      process.env.CAPTURE_SUBMIT_SELECTOR,
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("로그인")',
    ]);
    await settlePage(page, options.timeout);
    await saveStorageState(context, options.outputDir);
    await page.close().catch(() => {});
    return { status: "env-completed" };
  }

  throw new Error(`지원하지 않는 auth mode: ${options.authMode}`);
}

async function fillFirst(page, selectors, value, requiredField = true) {
  for (const selector of selectors.filter(Boolean)) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.fill(value);
      return true;
    }
  }
  if (requiredField) throw new Error(`입력 필드를 찾지 못했다: ${selectors.filter(Boolean).join(", ")}`);
  return false;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors.filter(Boolean)) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click();
      return true;
    }
  }
  throw new Error(`제출 버튼을 찾지 못했다: ${selectors.filter(Boolean).join(", ")}`);
}

async function saveStorageState(context, outputDir) {
  await context.storageState({ path: path.join(outputDir, "storage-state.json") });
}

async function settlePage(page, timeout) {
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 10000) }).catch(() => {});
  await page.waitForTimeout(500);
}

function toUrl(baseUrl, routePath) {
  if (!routePath) return baseUrl;
  if (String(routePath).startsWith("http://") || String(routePath).startsWith("https://")) {
    return routePath;
  }
  return new URL(routePath, baseUrl).toString();
}

function sanitizeName(value) {
  const raw = String(value || "page").replace(/^https?:\/\//, "");
  const name = raw.replace(/^\//, "home").replace(/[^a-zA-Z0-9가-힣._-]+/g, "-").replace(/-+/g, "-");
  return name.replace(/^-|-$/g, "") || "page";
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function renderMarkdown(report) {
  const successful = report.results.filter((item) => item.status === "success");
  const failed = report.results.filter((item) => item.status === "failed");

  return `# Project Capture Report

- 생성 시각: ${report.generatedAt}
- 기준 URL: ${report.baseUrl}
- 캡처 범위: ${report.scope}
- 인증 방식: ${report.authMode}
- 스크린샷 방식: ${report.screenshotMode}
- viewport: ${report.viewport.width}x${report.viewport.height}
- 입력 라우트: ${report.totalInputRoutes}
- 캡처 성공: ${report.capturedRoutes}
- 캡처 실패: ${report.failedRoutes}
- 제외 라우트: ${report.skippedRoutes.length}

## 성공

${successful.map((item) => `- ${item.path} -> ${item.screenshot}`).join("\n") || "- 없음"}

## 실패

${failed.map((item) => `- ${item.path}: ${item.reason}`).join("\n") || "- 없음"}

## 제외

${report.skippedRoutes.map((item) => `- ${item.path}: ${item.reason}`).join("\n") || "- 없음"}

## 비고

- 라우트 탐색과 캡처는 정적 분석 및 현재 세션 기준의 best-effort 결과다.
- 동적 라우트는 샘플 URL이 없으면 제외된다.
`;
}
