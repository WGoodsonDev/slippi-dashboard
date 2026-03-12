import { app } from "./app";
import supertest from "supertest";
import { describe, it, expect } from "vitest";

describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
        await supertest(app)
            .get('/health')
            .expect(200, { status: "ok" });
    })
})
    