#!/usr/bin/env python3
"""웹 프로젝트의 라우트와 인증 단서를 수집한다."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "coverage",
    "storybook-static",
    ".turbo",
    ".cache",
    "output",
    "outputs",
}

PAGE_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mdx"}
TEXT_EXTENSIONS = PAGE_EXTENSIONS | {".json", ".md", ".mjs", ".cjs"}
EXCLUDE_SEGMENTS = {"api", "_app", "_document", "_error"}
EXCLUDE_KEYWORDS = {
    "api",
    "callback",
    "logout",
    "webhook",
    "health",
    "status",
    "404",
    "500",
    "not-found",
}
CORE_KEYWORDS = {
    "dashboard": 90,
    "overview": 85,
    "workspace": 80,
    "home": 78,
    "users": 74,
    "members": 74,
    "settings": 72,
    "profile": 70,
    "admin": 70,
    "reports": 68,
    "products": 66,
    "orders": 66,
    "posts": 62,
    "list": 60,
    "detail": 58,
    "create": 56,
    "edit": 54,
    "form": 50,
}
AUTH_KEYWORDS = [
    "AuthGuard",
    "ProtectedRoute",
    "requireAuth",
    "withAuth",
    "middleware",
    "next-auth",
    "@clerk",
    "supabase",
    "firebase",
    "auth0",
    "passport",
    "/login",
    "/signin",
]


@dataclass
class Route:
    path: str
    source: str
    kind: str
    dynamic: bool = False
    sample_needed: bool = False
    excluded: bool = False
    priority: int = 0
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "source": self.source,
            "kind": self.kind,
            "dynamic": self.dynamic,
            "sample_needed": self.sample_needed,
            "excluded": self.excluded,
            "priority": self.priority,
            "reasons": self.reasons,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="프로젝트 라우트와 인증 단서를 분석한다.")
    parser.add_argument("project_root", nargs="?", default=".", help="분석할 프로젝트 루트")
    parser.add_argument("--output", "-o", help="JSON 결과를 저장할 경로")
    parser.add_argument("--max-files", type=int, default=2500, help="스캔할 최대 텍스트 파일 수")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def iter_files(root: Path, max_files: int) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if len(files) >= max_files:
            break
        if not path.is_file():
            continue
        rel_parts = set(path.relative_to(root).parts)
        if rel_parts & SKIP_DIRS:
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS:
            files.append(path)
    return files


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def normalize_route(path: str) -> str:
    path = path.strip().strip("\"'`")
    if not path:
        return "/"
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = "/" + path
    path = re.sub(r"/+", "/", path)
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    return path


def next_segment_to_route(segment: str) -> str | None:
    if segment.startswith("(") and segment.endswith(")"):
        return None
    if segment.startswith("@"):
        return None
    if segment == "index":
        return None
    if segment.startswith("[[...") and segment.endswith("]]"):
        return ":" + segment[5:-2] + "*"
    if segment.startswith("[...") and segment.endswith("]"):
        return ":" + segment[4:-1] + "*"
    if segment.startswith("[") and segment.endswith("]"):
        return ":" + segment[1:-1]
    return segment


def is_dynamic(path: str) -> bool:
    return bool(re.search(r"(:[A-Za-z0-9_]+|\[[^\]]+\]|\*)", path))


def should_exclude(path: str) -> bool:
    normalized = path.lower()
    parts = {part for part in normalized.split("/") if part}
    return bool(parts & EXCLUDE_KEYWORDS)


def score_route(path: str) -> tuple[int, list[str]]:
    if path == "/":
        return 100, ["root"]
    lowered = path.lower()
    score = max(0, 70 - max(0, len([p for p in path.split("/") if p]) - 1) * 8)
    reasons: list[str] = ["shallow-route"]
    for keyword, value in CORE_KEYWORDS.items():
        if keyword in lowered:
            score = max(score, value)
            reasons.append(keyword)
    if any(token in lowered for token in ("login", "signin", "signup")):
        score = max(score, 88)
        reasons.append("auth-entry")
    if is_dynamic(path):
        score -= 20
        reasons.append("dynamic")
    if should_exclude(path):
        score -= 80
        reasons.append("excluded-keyword")
    return max(score, 0), sorted(set(reasons))


def add_route(routes: dict[str, Route], route: Route) -> None:
    route.path = normalize_route(route.path)
    route.dynamic = route.dynamic or is_dynamic(route.path)
    route.sample_needed = route.dynamic
    route.excluded = route.excluded or should_exclude(route.path)
    route.priority, score_reasons = score_route(route.path)
    route.reasons = sorted(set(route.reasons + score_reasons))
    existing = routes.get(route.path)
    if not existing or route.priority > existing.priority:
        routes[route.path] = route


def discover_next_routes(root: Path, routes: dict[str, Route]) -> None:
    app_dir = root / "app"
    src_app_dir = root / "src" / "app"
    for base in [app_dir, src_app_dir]:
        if not base.exists():
            continue
        for page in base.rglob("*"):
            if not page.is_file() or page.stem not in {"page"} or page.suffix not in PAGE_EXTENSIONS:
                continue
            rel_dir = page.parent.relative_to(base)
            segments: list[str] = []
            excluded = False
            for part in rel_dir.parts:
                segment = next_segment_to_route(part)
                if part in EXCLUDE_SEGMENTS:
                    excluded = True
                if segment:
                    segments.append(segment)
            path = "/" + "/".join(segments)
            add_route(routes, Route(path=path, source=str(page), kind="next-app", excluded=excluded))

    for base in [root / "pages", root / "src" / "pages"]:
        if not base.exists():
            continue
        for page in base.rglob("*"):
            if not page.is_file() or page.suffix not in PAGE_EXTENSIONS:
                continue
            rel = page.relative_to(base)
            parts = list(rel.with_suffix("").parts)
            if any(part in EXCLUDE_SEGMENTS for part in parts):
                continue
            if parts and parts[-1] == "index":
                parts = parts[:-1]
            route_parts = [next_segment_to_route(part) for part in parts]
            path = "/" + "/".join(part for part in route_parts if part)
            add_route(routes, Route(path=path, source=str(page), kind="next-pages"))


def discover_remix_routes(root: Path, routes: dict[str, Route]) -> None:
    base = root / "app" / "routes"
    if not base.exists():
        return
    for page in base.rglob("*"):
        if not page.is_file() or page.suffix not in PAGE_EXTENSIONS:
            continue
        name = page.relative_to(base).with_suffix("").as_posix()
        name = name.replace("._index", "").replace("_index", "")
        parts = [part for chunk in name.split(".") for part in chunk.split("/") if part]
        route_parts: list[str] = []
        for part in parts:
            if part.startswith("$"):
                route_parts.append(":" + part[1:])
            elif not part.startswith("_"):
                route_parts.append(part)
        path = "/" + "/".join(route_parts)
        add_route(routes, Route(path=path, source=str(page), kind="remix"))


ROUTE_PATTERNS = [
    re.compile(r"<Route\b[^>]*\bpath\s*=\s*[\"']([^\"']+)[\"']", re.MULTILINE),
    re.compile(r"\bpath\s*:\s*[\"']([^\"']+)[\"']", re.MULTILINE),
]


def discover_router_literals(files: list[Path], routes: dict[str, Route]) -> None:
    for file in files:
        if file.suffix not in PAGE_EXTENSIONS | {".mjs", ".cjs"}:
            continue
        text = read_text(file)
        if not any(token in text for token in ("<Route", "createBrowserRouter", "path:")):
            continue
        for pattern in ROUTE_PATTERNS:
            for match in pattern.finditer(text):
                candidate = match.group(1)
                if candidate in {"*", "/"} or candidate.startswith("http"):
                    add_route(routes, Route(path=candidate, source=str(file), kind="router-literal"))
                elif candidate and not candidate.startswith(":"):
                    add_route(routes, Route(path=candidate, source=str(file), kind="router-literal"))


def detect_framework(package_json: dict[str, Any]) -> dict[str, Any]:
    deps = {}
    deps.update(package_json.get("dependencies", {}))
    deps.update(package_json.get("devDependencies", {}))
    frameworks: list[str] = []
    for name in ["next", "react-router", "react-router-dom", "@remix-run/react", "vite", "nuxt", "vue-router"]:
        if name in deps:
            frameworks.append(name)
    return {
        "package_manager": detect_package_manager(package_json),
        "frameworks": frameworks,
        "scripts": package_json.get("scripts", {}),
    }


def detect_package_manager(package_json: dict[str, Any]) -> str | None:
    manager = package_json.get("packageManager")
    if isinstance(manager, str):
        return manager
    return None


def detect_auth(root: Path, files: list[Path], package_json: dict[str, Any], routes: dict[str, Route]) -> dict[str, Any]:
    deps = {}
    deps.update(package_json.get("dependencies", {}))
    deps.update(package_json.get("devDependencies", {}))
    indicators: list[dict[str, str]] = []
    for dep in ["next-auth", "@clerk/nextjs", "@clerk/react", "@supabase/supabase-js", "firebase", "auth0", "passport"]:
        if dep in deps:
            indicators.append({"type": "dependency", "value": dep})

    login_routes = sorted(
        route.path for route in routes.values() if re.search(r"(login|signin|auth)", route.path, re.IGNORECASE)
    )

    for file in files[:1000]:
        text = read_text(file)
        lower_name = file.name.lower()
        if "middleware" in lower_name or "auth" in lower_name or "login" in lower_name:
            indicators.append({"type": "file", "value": str(file)})
        for keyword in AUTH_KEYWORDS:
            if keyword in text:
                indicators.append({"type": "code", "value": f"{keyword} in {file}"})
                break

    unique = []
    seen = set()
    for item in indicators:
        key = (item["type"], item["value"])
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return {
        "requires_review": bool(unique or login_routes),
        "login_routes": login_routes,
        "indicators": unique[:50],
        "recommended_modes": ["manual", "env", "none"] if unique or login_routes else ["none"],
    }


def build_result(root: Path, max_files: int) -> dict[str, Any]:
    package_json_path = root / "package.json"
    package_json = read_json(package_json_path) if package_json_path.exists() else {}
    files = iter_files(root, max_files)
    routes: dict[str, Route] = {}

    discover_next_routes(root, routes)
    discover_remix_routes(root, routes)
    discover_router_literals(files, routes)

    sorted_routes = sorted(routes.values(), key=lambda item: (-item.priority, item.path))
    return {
        "project_root": str(root),
        "framework": detect_framework(package_json),
        "summary": {
            "route_count": len(sorted_routes),
            "static_route_count": len([route for route in sorted_routes if not route.dynamic and not route.excluded]),
            "dynamic_route_count": len([route for route in sorted_routes if route.dynamic and not route.excluded]),
            "excluded_route_count": len([route for route in sorted_routes if route.excluded]),
        },
        "auth": detect_auth(root, files, package_json, routes),
        "routes": [route.to_dict() for route in sorted_routes],
        "core_routes": [
            route.to_dict()
            for route in sorted_routes
            if not route.excluded and not route.sample_needed and route.priority >= 60
        ][:30],
        "dynamic_routes": [route.to_dict() for route in sorted_routes if route.sample_needed and not route.excluded],
        "notes": [
            "라우트 탐색은 정적 파일과 라우터 리터럴 기반의 best-effort 결과다.",
            "동적 라우트는 샘플 URL이 없으면 사용자 확인 후 캡처한다.",
        ],
    }


def main() -> None:
    args = parse_args()
    root = Path(args.project_root).expanduser().resolve()
    result = build_result(root, args.max_files)
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)


if __name__ == "__main__":
    main()
