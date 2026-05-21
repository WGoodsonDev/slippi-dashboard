import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseReplayBuffer } from "../src/lib/replayParser.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Seeded games are associated with this clerkId. The demo user (clerkId "demo")
// is the target for Phase 3's public demo routes. Override with SEED_USER_CLERK_ID
// to seed into your own dev account instead.
const CLERK_ID = process.env.SEED_USER_CLERK_ID ?? "demo";

// The player in the fixture whose perspective we treat as "the user".
const USER_CONNECT_CODE = "DNTG#103";

async function main() {
    const fixtureBuffer = readFileSync(
        fileURLToPath(new URL("../test/fixtures/OptimalGenerousSparrow.slp", import.meta.url)),
    );
    const slpHash = createHash("sha256").update(fixtureBuffer).digest("hex");

    const user = await prisma.user.upsert({
        where: { clerkId: CLERK_ID },
        create: { clerkId: CLERK_ID },
        update: {},
    });

    const existingGame = await prisma.game.findUnique({
        where: { userId_slpHash: { userId: user.id, slpHash } },
    });

    if (existingGame) {
        console.log("Seed data already present — skipping.");
        return;
    }

    const parsedData = parseReplayBuffer(fixtureBuffer);
    const normalizedUserConnectCode = USER_CONNECT_CODE.toUpperCase();

    await prisma.$transaction(async (tx) => {
        const game = await tx.game.create({
            data: {
                userId: user.id,
                stage: parsedData.stage,
                duration: parsedData.duration,
                playedAt: parsedData.playedAt,
                slpFileUrl: "seed://OptimalGenerousSparrow.slp",
                slpHash,
            },
        });

        const gamePlayers = await Promise.all(
            parsedData.players.map((player) =>
                tx.gamePlayer.create({
                    data: {
                        gameId: game.id,
                        isUser: player.connectCode?.toUpperCase() === normalizedUserConnectCode,
                        character: player.characterName,
                        port: player.port,
                        connectCode: player.connectCode,
                        endStocks: player.endStocks,
                        endPercent: player.endPercent,
                    },
                }),
            ),
        );

        const gamePlayerIdByPort = new Map(gamePlayers.map((gp) => [gp.port, gp.id]));

        await Promise.all(
            parsedData.combos.map(async (combo) => {
                const comboingPlayerId = gamePlayerIdByPort.get(combo.comboingPlayerPort);
                const comboedPlayerId = gamePlayerIdByPort.get(combo.comboedPlayerPort);

                if (!comboingPlayerId || !comboedPlayerId) {
                    throw new Error(
                        `Could not resolve player IDs for combo: ports ${combo.comboingPlayerPort} and ${combo.comboedPlayerPort}`,
                    );
                }

                const createdCombo = await tx.combo.create({
                    data: {
                        gameId: game.id,
                        comboingPlayerId,
                        comboedPlayerId,
                        startPercent: combo.startPercent,
                        endPercent: combo.endPercent,
                        ledToKo: combo.ledToKo,
                        hitCount: combo.hits.length,
                    },
                });

                await tx.comboHit.createMany({
                    data: combo.hits.map((hit) => ({
                        comboId: createdCombo.id,
                        sequenceNumber: hit.sequenceNumber,
                        moveId: hit.moveId,
                        comboingX: hit.comboingX,
                        comboingY: hit.comboingY,
                        comboedX: hit.comboedX,
                        comboedY: hit.comboedY,
                        percentBefore: hit.percentBefore,
                        percentAfter: hit.percentAfter,
                        knockbackStrength: hit.knockbackStrength,
                        knockbackAngle: hit.knockbackAngle,
                    })),
                });
            }),
        );

        await Promise.all(
            parsedData.gamestateSegments.map(async (segment) => {
                const perspectivePlayerId = gamePlayerIdByPort.get(segment.playerPort);

                if (!perspectivePlayerId) {
                    throw new Error(
                        `Could not resolve player ID for segment: port ${segment.playerPort}`,
                    );
                }

                const createdSegment = await tx.gamestateSegment.create({
                    data: {
                        gameId: game.id,
                        perspectivePlayerId,
                        gamestate: segment.gamestate,
                        startFrame: segment.startFrame,
                        endFrame: segment.endFrame,
                    },
                });

                if (segment.positionSamples.length > 0) {
                    await tx.positionSample.createMany({
                        data: segment.positionSamples.map((sample) => ({
                            segmentId: createdSegment.id,
                            playerId: perspectivePlayerId,
                            x: sample.x,
                            y: sample.y,
                            frame: sample.frame,
                        })),
                    });
                }
            }),
        );

        console.log(`Seeded game ${game.id} for clerkId "${CLERK_ID}".`);
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
