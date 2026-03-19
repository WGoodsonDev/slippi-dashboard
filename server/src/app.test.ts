import { app } from "./app.js";
import supertest from "supertest";
import { describe, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("@clerk/express", () => ({
    clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    getAuth: (req: Request) => ({ userId: req.headers.authorization ? "test-user-id" : null }),
}));

vi.mock("./lib/prisma.js", () => ({
    prisma: {},
}));


describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
        await supertest(app)
            .get('/health')
            .expect(200, { status: "ok" });
    });
});
    
describe("POST /users/sync", () => {
    it("returns 401 when no Authorization header is provided", async () => {
        await supertest(app)
            .post("/users/sync")
            .expect(401);
    });
});