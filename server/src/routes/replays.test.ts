import { app } from "../app.js";
import supertest from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const {
    mockUserUpsert,
    mockTransaction,
    mockGameCreate,
    mockGamePlayerCreate,
    mockUploadReplayToS3,
    mockParseReplayBuffer,
} = vi.hoisted(() => ({
    mockUserUpsert: vi.fn(),
    mockTransaction: vi.fn(),
    mockGameCreate: vi.fn(),
    mockGamePlayerCreate: vi.fn(),
    mockUploadReplayToS3: vi.fn(),
    mockParseReplayBuffer: vi.fn(),
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

vi.mock("../lib/replayParser.js", () => ({
    parseReplayBuffer: mockParseReplayBuffer,
}));

const VALID_SLP_BUFFER = Buffer.from([0x7b, 0x55, 0x00]);

const DEFAULT_PARSED_REPLAY = {
    stage: "Battlefield",
    duration: 4800,
    playedAt: new Date("2026-01-01T00:00:00.000Z"),
    players: [
        { port: 1, characterName: "Fox", connectCode: "TEST#001", endStocks: 2, endPercent: 45.5 },
        { port: 2, characterName: "Falco", connectCode: "OPPE#123", endStocks: 0, endPercent: 134.2 },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();

    mockUserUpsert.mockResolvedValue({ id: "db-user-uuid" });
    mockGameCreate.mockResolvedValue({ id: "game-uuid" });
    mockGamePlayerCreate.mockResolvedValue({});
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
            game: { create: mockGameCreate },
            gamePlayer: { create: mockGamePlayerCreate },
        }),
    );
    mockUploadReplayToS3.mockResolvedValue(
        "https://bucket.s3.us-east-1.amazonaws.com/replays/db-user-uuid/game-uuid.slp",
    );
    mockParseReplayBuffer.mockReturnValue(DEFAULT_PARSED_REPLAY);
});

describe("POST /replays", () => {
    it("returns 401 when no Authorization header is provided", async () => {
        await supertest(app)
            .post("/replays")
            .attach("file", VALID_SLP_BUFFER, "game.slp")
            .expect(401);
    });

    it("returns 400 when no file is provided", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", "TEST#001")
            .expect(400, { error: "No file provided" });
    });

    it("returns 422 when file does not have a .slp extension", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", "TEST#001")
            .attach("file", VALID_SLP_BUFFER, "game.txt")
            .expect(422, { error: "File must have a .slp extension" });
    });

    it("returns 422 when file does not have valid Slippi magic bytes", async () => {
        const invalidBuffer = Buffer.from([0x00, 0x00, 0x00]);
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", "TEST#001")
            .attach("file", invalidBuffer, "game.slp")
            .expect(422, { error: "File does not appear to be a valid Slippi replay" });
    });

    it("returns 400 when userConnectCode is not provided", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .attach("file", VALID_SLP_BUFFER, "game.slp")
            .expect(400, { error: "userConnectCode is required" });
    });

    it("returns 422 when userConnectCode does not match any player in the replay", async () => {
        await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", "NOMATCH#999")
            .attach("file", VALID_SLP_BUFFER, "game.slp")
            .expect(422);
    });

    it("returns 201 with game metadata when upload is valid", async () => {
        const response = await supertest(app)
            .post("/replays")
            .set("Authorization", "Bearer test-token")
            .field("userConnectCode", "TEST#001")
            .attach("file", VALID_SLP_BUFFER, "game.slp")
            .expect(201);

        expect(response.body).toEqual({
            gameId: "game-uuid",
            stage: "Battlefield",
            duration: 4800,
            playedAt: "2026-01-01T00:00:00.000Z",
            players: [
                { port: 1, character: "Fox", connectCode: "TEST#001", isUser: true },
                { port: 2, character: "Falco", connectCode: "OPPE#123", isUser: false },
            ],
        });
    });
});