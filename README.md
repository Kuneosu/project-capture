# Project Capture

![Project Capture banner](assets/project-capture-banner-simple.png)

[한국어 README](README.ko.md)

Project Capture is a Codex skill for analyzing a web project, discovering candidate screens, asking for capture scope and authentication details, then capturing the selected screens with Playwright.

It is designed for guided screenshot collection, not for claiming that every possible state in an application can be captured automatically. Dynamic routes, authenticated screens, role-specific views, feature flags, and hidden UI states may require user confirmation or sample URLs.

## What It Does

- Inspects project structure and framework hints.
- Discovers candidate routes from Next.js, Remix, React Router, and common SPA patterns.
- Detects login and protected-route indicators before capture.
- Asks which screens to capture: all static routes, core domains, a specific domain, or a manual list.
- Handles dynamic routes with sample URLs when available.
- Supports manual login, environment-based login, or public-only capture.
- Captures screenshots with Playwright.
- Supports full-page screenshots or visible-viewport screenshots.
- Writes a Markdown report and JSON result file.

## Repository Structure

```text
project-capture/
├── SKILL.md
├── README.md
├── README.ko.md
├── assets/
│   ├── project-capture-banner.png
│   ├── project-capture-banner-simple.png
│   └── project-capture-logo.png
├── references/
│   ├── auth-handling.md
│   └── route-discovery.md
└── scripts/
    ├── capture_pages.mjs
    └── discover_routes.py
```

## Install

Copy this directory into your Codex skills directory:

```bash
cp -R project-capture ~/.codex/skills/project-capture
```

Then start a new Codex session so the skill metadata can be loaded.

## Use Outside Codex

Project Capture is packaged as a Codex skill, but the core functionality is implemented as standalone scripts. Other AI coding agents such as Claude Code, Gemini CLI, or custom terminal agents can use this repository by reading the workflow in `SKILL.md` and running the scripts directly.

Recommended agent instruction:

```text
Use this repository as a project screen capture toolkit. First run scripts/discover_routes.py to inspect the target web project, summarize candidate routes, ask me which capture scope to use, ask about login if protected routes are detected, then run scripts/capture_pages.mjs with Playwright to save screenshots and a report.
```

Minimal script flow:

```bash
python3 scripts/discover_routes.py /path/to/project \
  --output /path/to/project/output/playwright/project-capture-routes.json

npx --yes --package playwright node scripts/capture_pages.mjs \
  --base-url http://localhost:3000 \
  --routes /path/to/project/output/playwright/project-capture-routes.json \
  --scope core \
  --screenshot-mode viewport \
  --viewport 1440x900 \
  --output-dir /path/to/project/output/playwright/project-capture
```

For non-Codex agents, treat `SKILL.md` as the operating guide, `references/` as supporting policy, and `scripts/` as the executable implementation.

## Typical Workflow

1. Ask Codex to use `project-capture`, `/capture`, or to capture project screens.
2. Codex inspects the project and discovers route candidates.
3. Codex asks for the capture scope.
4. Codex asks for login handling if protected routes are detected.
5. Codex asks whether screenshots should be `fullpage` or `viewport`.
6. Codex captures the selected screens.
7. Codex summarizes the generated report.

## Capture Scope

The skill asks the user to choose one scope before taking screenshots:

- `all`: discovered static routes.
- `core`: inferred core product screens such as home, login, dashboard, settings, list/detail/create/edit screens.
- `domain`: routes under a specific prefix such as `/admin`, `/users`, or `/settings`.
- `manual`: user-provided URL or path list.
- `custom`: any other user-defined condition.

## Screenshot Mode

Project Capture supports two screenshot modes:

```bash
--screenshot-mode fullpage
```

Captures the full scrollable page.

```bash
--screenshot-mode viewport --viewport 1440x900
```

Captures only the visible viewport at the selected size.

## Authentication

When login is detected, the skill asks for one mode:

- `manual`: opens a headed browser so the user can log in directly.
- `env`: uses `CAPTURE_USER`, `CAPTURE_PASSWORD`, and optional selector variables.
- `none`: captures public screens only.

Manual login is recommended for OAuth, SSO, WebAuthn, CAPTCHA, SMS OTP, and email OTP.

## Script Usage

Discover routes:

```bash
python3 scripts/discover_routes.py /path/to/project --output output/playwright/project-capture-routes.json
```

Capture core routes:

```bash
npx --yes --package playwright node scripts/capture_pages.mjs \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope core \
  --screenshot-mode viewport \
  --viewport 1440x900 \
  --output-dir output/playwright/project-capture
```

Manual login:

```bash
npx --yes --package playwright node scripts/capture_pages.mjs \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope static \
  --auth-mode manual \
  --login-path /login \
  --headed \
  --output-dir output/playwright/project-capture
```

## Output

```text
output/playwright/project-capture/
├── screenshots/
├── capture-report.md
├── capture-results.json
└── storage-state.json
```

`storage-state.json` may contain sensitive session data. Do not commit it.

## Limitations

- Route discovery is best-effort static analysis.
- Runtime-only menus and feature-flagged screens may not be discovered.
- Dynamic routes need sample values.
- The skill does not automatically cycle through multiple roles or accounts.
- It does not perform visual regression testing.
