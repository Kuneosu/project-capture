# Auth Handling

Use this reference when login or protected routes are detected.

## Login Indicators

Look for these signs before capture:

- routes containing `login`, `signin`, `auth`, `session`, `callback`.
- files or identifiers such as `AuthGuard`, `ProtectedRoute`, `requireAuth`, `middleware`, `withAuth`.
- dependencies such as `next-auth`, `@clerk`, `supabase`, `firebase`, `auth0`, `passport`.
- redirects to `/login` or `/signin`.
- README or `.env.example` variables for auth providers.

## Required User Confirmation

If login appears necessary, ask for one mode:

- `수동 로그인`: best for SSO, OAuth, social login, SMS/email OTP, or unknown login UI.
- `테스트 계정 입력`: acceptable only for non-production accounts supplied for this run.
- `환경변수 사용`: best for repeated local/dev runs. Use `CAPTURE_USER`, `CAPTURE_PASSWORD`, optional `CAPTURE_OTP`.
- `로그인 생략`: capture public screens only.

Do not ask the user to reveal production credentials. Do not include credentials in reports, filenames, shell history explanations, or commits.

## Manual Login

Run capture with `--auth-mode manual --headed --login-path /login`. The script opens the login page and waits for the user to finish login in the browser. Continue after the user confirms in the terminal.

Use manual login for:

- OAuth or social login.
- SSO.
- SMS/email OTP.
- WebAuthn/passkey.
- CAPTCHA.
- multi-step login forms that are difficult to infer.

## Environment Credentials

Use `--auth-mode env` only when the login form is simple and the app is local/dev. Required variables:

- `CAPTURE_USER`
- `CAPTURE_PASSWORD`

Optional variables:

- `CAPTURE_OTP`
- `CAPTURE_USER_SELECTOR`
- `CAPTURE_PASSWORD_SELECTOR`
- `CAPTURE_OTP_SELECTOR`
- `CAPTURE_SUBMIT_SELECTOR`

If automatic login fails, fall back to manual login.

## Session Files

If a storage state file is created, treat it as sensitive. Keep it inside the capture output directory and do not commit it.
