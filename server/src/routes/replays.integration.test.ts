import { app } from "../app.js";
import supertest from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import type { Request, Response, NextFunction } from "express";

// This test uses the real parseReplayBuffer against a committed .slp fixture.
// Prisma and S3 are mocked — the goal is to verify that the parsing pipeline
// produces the correct number of combos and hits, and that player IDs resolve correctly.

const {
    mockUserUpsert,
    mockTransaction,
    mockGameCreate,
    mockGamePlayerCreate,
    mockComboCreate,
    mockComboHitCreateMany,
    mockUploadReplayToS3,
} = vi.hoisted(() => ({
    mockUserUpsert: vi.fn(),
    mockTransaction: vi.fn(),
    mockGameCreate: vi.fn(),
    mockGamePlayerCreate: vi.fn(),
    mockComboCreate: vi.fn(),
    mockComboHitCreateMany: vi.fn(),
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

vi.mock("../lib/prisma.js", () => ({
    prisma: {
        user: { upsert: mockUserUpsert },
        $transaction: mockTransaction,
    },
}));

vi.mock("../lib/s3.js", () => ({
    uploadReplayToS3: mockUploadReplayToS3,
}));

const FIXTURE_BUFFER = readFileSync(
    fileURLToPath(new URL("../../test/fixtures/OptimalGenerousSparrow.slp", import.meta.url)),
);

// Player data confirmed from fixture inspection:
//   playerIndex=0  port=1  connectCode=DNTG#103
//   playerIndex=1  port=2  connectCode=ACAB#000
const USER_CONNECT_CODE = "DNTG#103";
const EXPECTED_COMBO_COUNT = 71;

beforeEach(() => {
    vi.clearAllMocks();

    mockUserUpsert.mockResolvedValue({ id: "db-user-uuid" });
    mockGameCreate.mockResolvedValue({ id: "game-uuid" });
    // Return { id, port } so the route can build the port → ID map
    mockGamePlayerCreate.mockImplementation(async (args: { data: { port: number } }) => ({
        id: `player-${args.data.port}-uuid`,
        port: args.data.port,
    }));
    mockComboCreate.mockResolvedValue({ id: "combo-uuid" });
    mockComboHitCreateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
            game: { create: mockGameCreate },
            gamePlayer: { create: mockGamePlayerCreate },
            combo: { create: mockComboCreate },
            comboHit: { createMany: mockComboHitCreateMany },
        }),
    );
    mockUploadReplayToS3.mockResolvedValue(
        "https://bucket.s3.us-west-2.amazonaws.com/replays/db-user-uuid/game-uuid.slp",
    );
});

describe("POST /replays — combo ingestion", () => {
    it("writes the correct number of combos for a known replay", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", USER_CONNECT_CODE)
            .attach("file", FIXTURE_BUFFER, "OptimalGenerousSparrow.slp")
            .expect(201);

        expect(mockComboCreate).toHaveBeenCalledTimes(EXPECTED_COMBO_COUNT);
    });

    it("writes at least one ComboHit per combo", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", USER_CONNECT_CODE)
            .attach("file", FIXTURE_BUFFER, "OptimalGenerousSparrow.slp")
            .expect(201);

        expect(mockComboHitCreateMany).toHaveBeenCalledTimes(EXPECTED_COMBO_COUNT);
        const allCalls = mockComboHitCreateMany.mock.calls as Array<[{ data: unknown[] }]>;
        expect(allCalls.every((call) => call[0].data.length >= 1)).toBe(true);
    });

    it("resolves comboing and comboed player IDs from the created GamePlayer records", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", USER_CONNECT_CODE)
            .attach("file", FIXTURE_BUFFER, "OptimalGenerousSparrow.slp")
            .expect(201);

        // combo[0] in this fixture: playerIndex=0 (port 1) being comboed, lastHitBy=1 (port 2) comboing
        expect(mockComboCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    comboingPlayerId: "player-2-uuid",
                    comboedPlayerId: "player-1-uuid",
                }),
            }),
        );
    });
});
