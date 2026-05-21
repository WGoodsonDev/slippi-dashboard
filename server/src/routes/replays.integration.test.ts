import { app } from "../app.js";
import supertest from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

// Full-stack integration test: real slippi-js parser + real PostgreSQL.
// S3 is mocked (no AWS in tests). Auth is bypassed as in the unit test.
// Runs against the local dev DB; afterAll deletes every row written by this
// test in FK-respecting order. Skipped in CI where DATABASE_URL is not set
// (dedicated test DB is deferred to Phase 4).

const { mockUploadReplayToS3 } = vi.hoisted(() => ({
    mockUploadReplayToS3: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
    clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
        if (!req.headers.authorization) {
            res.status(401).json({ error: "Unauthenticated" });
            return;
        }
        next();
    },
    getAuth: (req: Request) => ({ userId: req.headers.authorization ? "clerk_user_test_123" : null }),
}));

vi.mock("../lib/s3.js", () => ({
    uploadReplayToS3: mockUploadReplayToS3,
}));

const FIXTURE_BUFFER = readFileSync(
    fileURLToPath(new URL("../../test/fixtures/OptimalGenerousSparrow.slp", import.meta.url)),
);

// Player and game data confirmed from fixture inspection:
//   playerIndex=0  port=1  connectCode=DNTG#103
//   playerIndex=1  port=2  connectCode=ACAB#000
//   stageId=28 (Dream Land N64), 292 total gamestate segments, 71 combos
const USER_CONNECT_CODE = "DNTG#103";
const EXPECTED_COMBO_COUNT = 71;
const EXPECTED_SEGMENT_COUNT = 292;

describe.skipIf(!process.env.DATABASE_URL)("POST /replays — pipeline integration", () => {
    let gameId: string;
    let port1PlayerId: string;
    let port2PlayerId: string;

    beforeAll(async () => {
        mockUploadReplayToS3.mockResolvedValue(
            "https://bucket.s3.us-west-2.amazonaws.com/replays/db-user-uuid/game-uuid.slp",
        );

        const response = await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", USER_CONNECT_CODE)
            .attach("file", FIXTURE_BUFFER, "OptimalGenerousSparrow.slp");

        expect(response.status).toBe(201);
        gameId = response.body.gameId;

        const players = await prisma.gamePlayer.findMany({ where: { gameId } });
        port1PlayerId = players.find((p) => p.port === 1)!.id;
        port2PlayerId = players.find((p) => p.port === 2)!.id;
    });

    afterAll(async () => {
        if (!gameId) return;

        const segments = await prisma.gamestateSegment.findMany({ where: { gameId } });
        await prisma.positionSample.deleteMany({
            where: { segmentId: { in: segments.map((s) => s.id) } },
        });
        await prisma.gamestateSegment.deleteMany({ where: { gameId } });

        const combos = await prisma.combo.findMany({ where: { gameId } });
        await prisma.comboHit.deleteMany({
            where: { comboId: { in: combos.map((c) => c.id) } },
        });
        await prisma.combo.deleteMany({ where: { gameId } });

        await prisma.gamePlayer.deleteMany({ where: { gameId } });
        await prisma.game.delete({ where: { id: gameId } });
        await prisma.user.deleteMany({ where: { clerkId: "clerk_user_test_123" } });
    });

    describe("combo ingestion", () => {
        it("writes the correct number of combos for a known replay", async () => {
            const combos = await prisma.combo.findMany({ where: { gameId } });
            expect(combos).toHaveLength(EXPECTED_COMBO_COUNT);
        });

        it("writes at least one ComboHit per combo", async () => {
            const combos = await prisma.combo.findMany({
                where: { gameId },
                include: { hits: true },
            });
            expect(combos.every((c) => c.hits.length >= 1)).toBe(true);
        });

        it("resolves comboing and comboed player IDs from the created GamePlayer records", async () => {
            // In this fixture, port 2 (ACAB#000) combos port 1 (DNTG#103)
            const matchingComboCount = await prisma.combo.count({
                where: {
                    gameId,
                    comboingPlayerId: port2PlayerId,
                    comboedPlayerId: port1PlayerId,
                },
            });
            expect(matchingComboCount).toBeGreaterThan(0);
        });
    });

    describe("gamestate segment ingestion", () => {
        it("writes the correct number of gamestate segments for a known replay", async () => {
            const segments = await prisma.gamestateSegment.findMany({ where: { gameId } });
            expect(segments).toHaveLength(EXPECTED_SEGMENT_COUNT);
        });

        it("produces all five gamestates across the segments", async () => {
            const segments = await prisma.gamestateSegment.findMany({ where: { gameId } });
            const gamestates = new Set(segments.map((s) => s.gamestate));
            for (const gs of ["NEUTRAL", "HITSTUN", "LEDGE", "OFFSTAGE", "DEAD"]) {
                expect(gamestates).toContain(gs);
            }
        });

        it("resolves perspective player ID from the created GamePlayer records", async () => {
            const segments = await prisma.gamestateSegment.findMany({ where: { gameId } });
            const validPlayerIds = new Set([port1PlayerId, port2PlayerId]);
            expect(segments.every((s) => validPlayerIds.has(s.perspectivePlayerId))).toBe(true);
        });
    });

    describe("position sample ingestion", () => {
        it("writes position samples for at least one gamestate segment", async () => {
            const segments = await prisma.gamestateSegment.findMany({ where: { gameId } });
            const positionSamples = await prisma.positionSample.findMany({
                where: { segmentId: { in: segments.map((s) => s.id) } },
            });
            expect(positionSamples.length).toBeGreaterThan(0);
        });
    });
});
