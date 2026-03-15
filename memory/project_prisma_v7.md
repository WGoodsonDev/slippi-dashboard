---
name: Prisma 7 setup
description: Quirks and decisions specific to Prisma 7 in this project
type: project
---

This project uses Prisma 7, which has significant differences from earlier versions.

**Key differences:**
- Generates TypeScript source files, not compiled JS. Main entry point is `client.ts`, not `index.js`. Import as `"../generated/prisma/client.js"` (Node16 moduleResolution resolves .js → .ts).
- Requires a Driver Adapter — `PrismaClient` constructor takes `{ adapter }`, not a bare connection string. Adapter: `@prisma/adapter-pg` with `PrismaPg`.
- `schema.prisma` datasource has no `url` field — connection string lives in the adapter instantiation at runtime.
- `prisma.config.ts` is generated in `server/` root (not `src/`). Must be excluded in `tsconfig.json` via `"exclude": ["prisma.config.ts"]`.

**Packages installed:** `@prisma/adapter-pg`, `pg`, `@types/pg` (in server workspace).

**`prisma.ts` pattern:**
```typescript
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
export { prisma };
```

**Testing:** Mock `"./lib/prisma.js"` in Vitest with `vi.mock` to prevent module load issues in tests. Also mock `"@clerk/express"` since `clerkMiddleware` is applied globally in `app.ts`.

**Local DB:** Postgres runs in Docker. Container name: `slippi-pg`. Start with:
```bash
docker start slippi-pg
```
If deleted, recreate with:
```bash
docker run -d --name slippi-pg -e POSTGRES_PASSWORD=<password> -p 5432:5432 postgres:16
docker exec -it slippi-pg psql -U postgres -c "CREATE DATABASE slippi_dashboard;"
npm run migrate --workspace=server
```