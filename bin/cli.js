#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(packageRoot, "package.json"));
const skillName = "project-capture";

const args = process.argv.slice(2);
const command = args[0] || "help";
const rest = args.slice(1);

switch (command) {
  case "init":
    init(rest);
    break;
  case "discover":
    runDiscover(rest);
    break;
  case "capture":
    runCapture(rest);
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(packageJson.version);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function init(argv) {
  const options = parseInitOptions(argv);
  const projectRoot = path.resolve(options.dir || process.cwd());
  const agent = options.agent || "all";
  const installed = [];

  if (["all", "codex"].includes(agent)) {
    const destination = options.globalCodex
      ? path.join(homeDir(), ".codex", "skills", skillName)
      : path.join(projectRoot, ".codex", "skills", skillName);
    copySkill(destination, options.force);
    installed.push(destination);
  }

  if (["all", "claude"].includes(agent) && !options.globalCodex) {
    const destination = path.join(projectRoot, ".claude", "skills", skillName);
    copySkill(destination, options.force);
    installed.push(destination);
  }

  if (!options.noConfig && !options.globalCodex) {
    injectAgentInstruction(projectRoot);
  }

  console.log("project-capture initialized.");
  for (const item of installed) {
    console.log(`- ${item}`);
  }
}

function parseInitOptions(argv) {
  const options = {
    agent: "all",
    force: false,
    noConfig: false,
    globalCodex: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dir") {
      options.dir = argv[index + 1];
      index += 1;
    } else if (token === "--agent") {
      options.agent = argv[index + 1];
      index += 1;
    } else if (token === "--force") {
      options.force = true;
    } else if (token === "--no-config") {
      options.noConfig = true;
    } else if (token === "--global-codex") {
      options.globalCodex = true;
      options.agent = "codex";
    } else {
      throw new Error(`Unknown init option: ${token}`);
    }
  }

  if (!["all", "codex", "claude"].includes(options.agent)) {
    throw new Error("--agent must be one of: all, codex, claude");
  }

  return options;
}

function copySkill(destination, force) {
  if (fs.existsSync(destination)) {
    if (!force) {
      console.log(`Skipping existing skill directory: ${destination}`);
      return;
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }

  fs.mkdirSync(destination, { recursive: true });
  copyFile("SKILL.md", destination);
  copyDirectory("references", path.join(destination, "references"));
  copyDirectory("scripts", path.join(destination, "scripts"));
  fs.mkdirSync(path.join(destination, "assets"), { recursive: true });
  fs.copyFileSync(
    path.join(packageRoot, "assets", "project-capture-banner-simple.png"),
    path.join(destination, "assets", "project-capture-banner-simple.png")
  );
}

function copyFile(relativePath, destinationDirectory) {
  fs.copyFileSync(path.join(packageRoot, relativePath), path.join(destinationDirectory, path.basename(relativePath)));
}

function copyDirectory(relativePath, destination) {
  fs.cpSync(path.join(packageRoot, relativePath), destination, { recursive: true });
}

function injectAgentInstruction(projectRoot) {
  const candidates = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules"];
  const existing = candidates.filter((file) => fs.existsSync(path.join(projectRoot, file)));
  const targets = existing.length ? existing : ["AGENTS.md"];
  const block = [
    "",
    "<!-- project-capture:start -->",
    "## project-capture",
    "",
    "Use project-capture when the user asks to capture web project screens, run `/capture`, analyze routes for screenshots, or generate a screenshot report.",
    "",
    "Workflow:",
    "1. Read `.codex/skills/project-capture/SKILL.md` or `.claude/skills/project-capture/SKILL.md` if available.",
    "2. Run route discovery before asking for capture scope.",
    "3. Ask for capture scope, login handling, and screenshot mode before capturing.",
    "4. Use `scripts/discover_routes.py` and `scripts/capture_pages.mjs` to create screenshots and `capture-report.md`.",
    "<!-- project-capture:end -->",
    "",
  ].join("\n");

  for (const target of targets) {
    const filePath = path.join(projectRoot, target);
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    if (current.includes("<!-- project-capture:start -->")) {
      console.log(`Instruction already present: ${target}`);
      continue;
    }
    fs.writeFileSync(filePath, current.trimEnd() + block, "utf8");
    console.log(`Updated ${target}`);
  }
}

function runDiscover(argv) {
  const script = path.join(packageRoot, "scripts", "discover_routes.py");
  const result = spawnSync("python3", [script, ...argv], { stdio: "inherit" });
  process.exit(result.status || 0);
}

function runCapture(argv) {
  const script = path.join(packageRoot, "scripts", "capture_pages.mjs");
  const result = spawnSync("npx", ["--yes", "--package", "playwright", "node", script, ...argv], {
    stdio: "inherit",
  });
  process.exit(result.status || 0);
}

function printHelp() {
  console.log(`project-capture ${packageJson.version}

Usage:
  project-capture init [--dir <project>] [--agent all|codex|claude] [--global-codex] [--force] [--no-config]
  project-capture discover <project-root> --output <routes.json>
  project-capture capture --base-url <url> --routes <routes.json> [options]

Commands:
  init       Install the skill into a project for Codex and/or Claude-style agents.
  discover   Run scripts/discover_routes.py.
  capture    Run scripts/capture_pages.mjs through Playwright.
  help       Show this help.
  version    Print package version.

Examples:
  npx project-capture init
  npx project-capture init --global-codex
  npx project-capture discover . --output output/playwright/project-capture-routes.json
  npx project-capture capture --base-url http://localhost:3000 --routes output/playwright/project-capture-routes.json --scope core --screenshot-mode viewport --viewport 1440x900
`);
}

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}
