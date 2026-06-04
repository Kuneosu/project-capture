# Route Discovery

Use this reference when route discovery output is incomplete or when choosing `핵심 도메인` routes.

## Discovery Sources

Inspect these sources first:

- `package.json`: framework, scripts, router dependencies.
- Next.js `app/**/page.*`, `pages/**/*`, and `middleware.*`.
- React Router declarations: `<Route path="...">`, `path: "..."`, `createBrowserRouter`, `createRoutesFromElements`.
- Remix route files under `app/routes`.
- Vite/SPA route modules under `src/routes`, `src/pages`, `src/app`, and `src/router`.
- README, seed files, fixtures, mocks, and test data for dynamic route samples.

Ignore these by default:

- `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `storybook-static`.
- API-only routes, callback routes, logout routes, error pages, external auth/payment redirects.

## Dynamic Routes

Treat these as dynamic:

- Next.js: `[id]`, `[slug]`, `[...slug]`, `[[...slug]]`.
- React Router: `:id`, `:slug`, `*`.
- File conventions such as `$id`, `$slug`.

Use a sample only when it is clearly available from README, seed, fixture, mock, or user input. If no sample exists, ask whether to exclude the route or provide a concrete URL.

## Core Domain Scoring

For `핵심 도메인`, prioritize routes in this order:

1. `/`, `/login`, `/signin`, `/signup`.
2. Dashboard or workspace screens: `dashboard`, `home`, `overview`, `workspace`.
3. Main navigation destinations found in sidebars, headers, route config labels, or menu arrays.
4. CRUD screens: list, detail, create, edit, form, register, manage.
5. User-facing domains: users, members, products, orders, posts, reports, settings, profile, admin.
6. Routes with shallow depth and readable names.

Lower priority or exclude:

- callback, logout, api, webhook, health, status, 404, 500, not-found.
- dynamic routes without sample data.
- hidden routes with no navigation or clear domain meaning.

When uncertain, show candidates to the user instead of silently excluding them.
