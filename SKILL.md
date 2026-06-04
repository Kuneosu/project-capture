---
name: project-capture
description: "프로젝트 화면 캡처 자동화 스킬. Use when the user asks for project-capture, /capture, 프로젝트 화면 캡처, 전체 화면 스크린샷, 라우트 캡처, or wants Codex to analyze a web project, ask for capture scope and login needs, then use Playwright to capture selected screens and generate a report."
---

# Project Capture

## Overview

Analyze a web project, discover candidate screens, ask the user to choose the capture scope, handle login requirements, then capture the selected screens with Playwright and generate a report.

Treat this as a guided capture workflow. Do not claim that every possible screen is guaranteed; dynamic routes, hidden states, and authenticated role-specific pages require user confirmation or sample data.

## Required Rules

- Inspect the project before asking for capture scope.
- Ask the user for capture scope before taking screenshots.
- Ask the user for screenshot mode before taking screenshots: `fullpage` for the full scroll length or `viewport` for only the visible viewport at a selected size.
- If protected routes or login flows are detected, ask for an authentication mode before capturing protected screens.
- Never print, store, or commit passwords, OTP values, production credentials, or session files.
- Prefer test accounts, local/dev environments, and manual login for SSO, OAuth, or OTP-heavy flows.
- Use the installed `playwright` skill for browser automation conventions. Prefer its wrapper for exploratory browser work and this skill's `capture_pages.mjs` for batch screenshots.
- Save artifacts in `output/playwright/project-capture-<timestamp>/` inside the target project unless the user requests another location.

## Workflow

### 1. Analyze the project

Set the project root and run route discovery:

```bash
python3 "$SKILL_DIR/scripts/discover_routes.py" "$PROJECT_ROOT" --output output/playwright/project-capture-routes.json
```

Review the generated JSON. Also inspect the project manually when the result is uncertain. For route discovery details, read `references/route-discovery.md`.

### 2. Ask for capture scope

After analysis, summarize the detected framework, route count, login indicators, and dynamic routes. Then ask the user to choose one capture scope:

- `전체`: all discovered static routes.
- `핵심 도메인`: high-priority product screens inferred by this skill.
- `특정 도메인`: routes under a user-provided prefix such as `/admin`, `/users`, or `/settings`.
- `수동 지정`: explicit URL/path list from the user.
- `기타`: any custom condition.

If dynamic routes such as `/users/[id]` or `/posts/:id` have no sample value, ask whether to exclude them or provide sample URLs.

### 3. Resolve authentication

If login or protected-route indicators exist, ask for one authentication mode:

- `수동 로그인`: open a headed browser and let the user log in directly.
- `테스트 계정 입력`: use a non-production test account supplied by the user for this run.
- `환경변수 사용`: use `CAPTURE_USER`, `CAPTURE_PASSWORD`, and optional `CAPTURE_OTP`.
- `로그인 생략`: capture only public screens.

For SSO, OAuth, SMS/email OTP, or uncertain login forms, prefer `수동 로그인`. For details, read `references/auth-handling.md`.

### 4. Ask for screenshot mode

Ask the user to choose one screenshot mode:

- `fullpage`: capture the full scrollable page length.
- `viewport`: capture only the visible viewport.

For `viewport`, ask for a viewport size if the user did not provide one. Use `1280x720` as the default when the user has no preference. Examples: `1280x720`, `1440x900`, `1920x1080`.

### 5. Prepare selected routes

Create or edit a JSON file containing only the selected route entries. The capture script accepts either:

```json
[
  { "path": "/", "name": "home" },
  { "path": "/dashboard", "name": "dashboard" }
]
```

or the full output from `discover_routes.py`; when using the full output, pass `--scope core` or `--scope static`.

### 6. Capture screens

Start the target app first. If no server is running, inspect `package.json` and ask before installing dependencies or performing any network-dependent setup.

Run batch capture:

```bash
npx --yes --package playwright node "$SKILL_DIR/scripts/capture_pages.mjs" \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope core \
  --screenshot-mode fullpage \
  --output-dir output/playwright/project-capture-YYYYMMDD-HHMMSS
```

For visible viewport capture:

```bash
npx --yes --package playwright node "$SKILL_DIR/scripts/capture_pages.mjs" \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope core \
  --screenshot-mode viewport \
  --viewport 1440x900 \
  --output-dir output/playwright/project-capture-YYYYMMDD-HHMMSS
```

For manual login:

```bash
npx --yes --package playwright node "$SKILL_DIR/scripts/capture_pages.mjs" \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope static \
  --auth-mode manual \
  --login-path /login \
  --screenshot-mode viewport \
  --viewport 1280x720 \
  --headed \
  --output-dir output/playwright/project-capture-YYYYMMDD-HHMMSS
```

For environment-variable credentials:

```bash
CAPTURE_USER="test@example.com" CAPTURE_PASSWORD="..." \
npx --yes --package playwright node "$SKILL_DIR/scripts/capture_pages.mjs" \
  --base-url http://localhost:3000 \
  --routes output/playwright/project-capture-routes.json \
  --scope static \
  --auth-mode env \
  --login-path /login \
  --screenshot-mode fullpage \
  --output-dir output/playwright/project-capture-YYYYMMDD-HHMMSS
```

### 7. Report results

Open `capture-report.md` and summarize:

- capture scope and authentication mode
- screenshot mode and viewport size
- successful screenshots
- failed or skipped routes
- dynamic routes that need sample values
- visible console or network errors when relevant

Mention that discovered routes are best-effort when the framework uses runtime-only navigation, feature flags, or data-driven menus.

## Bundled Resources

- `scripts/discover_routes.py`: discover framework, route candidates, dynamic routes, auth indicators, and core-route priority.
- `scripts/capture_pages.mjs`: capture selected routes with Playwright and generate `capture-report.md`.
- `references/route-discovery.md`: framework-specific route discovery and core-domain scoring guidance.
- `references/auth-handling.md`: login detection, credential handling, OTP, SSO, and session guidance.
