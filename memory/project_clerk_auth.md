---
name: Clerk auth integration
description: Status and decisions from the Clerk auth integration session
type: project
---

Clerk auth is fully integrated and working as of 2026-03-15.

**What's in place:**
- `@clerk/express` on the server: `clerkMiddleware()` globally in `app.ts`, `requireAuth()` on the users router
- `@clerk/react` on the client (NOT `@clerk/clerk-react` — deprecated): `ClerkProvider` in `main.tsx`, `useAuth()` + `SignInButton`/`UserButton` in `App.tsx`
- `POST /users/sync` — upserts a User row by `clerkId` on first sign-in; called from frontend via `useEffect` on `isSignedIn`
- Vitest test for 401 on `/users/sync` using `vi.mock('@clerk/express')` and `vi.mock('./lib/prisma.js')` — no real Clerk keys needed in tests
- CORS configured with `cors()` and explicit `app.options("/{*path}", cors())` (Express 5 wildcard syntax)

**Key @clerk/express quirks:**
- `req.auth` is a FUNCTION, not an object. Call `req.auth()` to get the auth object.
- Use `getAuth(req)` helper from `@clerk/express` as the cleanest way to access auth in route handlers — avoids type incompatibility with Express's `Request` type.
- `CLERK_PUBLISHABLE_KEY` must be set in `server/.env` in addition to `CLERK_SECRET_KEY`.
- `ExpressRequestWithAuth` type is exported but causes handler type incompatibility — prefer `getAuth(req)` instead.

**Remaining before webhooks:**
- Replace frontend sync call with Clerk webhook after deployment.