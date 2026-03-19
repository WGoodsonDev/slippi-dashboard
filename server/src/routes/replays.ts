import { Router, Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { requireApiAuth } from "../lib/auth.js";
import multer from "multer";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { uploadReplayToS3 } from "../lib/s3.js";
import { parseReplayBuffer } from "../lib/replayParser.js";

const replaysRouter = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

const SLP_EXTENSION = ".slp";
const SLP_MAGIC_BYTE_0 = 0x7b; // {
const SLP_MAGIC_BYTE_1 = 0x55; // U

function hasSlpExtension(filename: string): boolean {
    return filename.toLowerCase().endsWith(SLP_EXTENSION);
}

function hasSlpMagicBytes(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === SLP_MAGIC_BYTE_0 && buffer[1] === SLP_MAGIC_BYTE_1;
}

replaysRouter.post(
    "/",
    requireApiAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
        if (!req.file) {
            res.status(400).json({ error: "No file provided" });
            return;
        }

        if (!hasSlpExtension(req.file.originalname)) {
            res.status(422).json({ error: "File must have a .slp extension" });
            return;
        }

        if (!hasSlpMagicBytes(req.file.buffer)) {
            res.status(422).json({ error: "File does not appear to be a valid Slippi replay" });
            return;
        }

        const userConnectCode = req.body.userConnectCode as string | undefined;
        if (!userConnectCode) {
            res.status(400).json({ error: "userConnectCode is required" });
            return;
        }
        const normalizedUserConnectCode = userConnectCode.toUpperCase();

        const clerkUserId = getAuth(req).userId as string;

        try {
            const dbUser = await prisma.user.upsert({
                where: { clerkId: clerkUserId },
                create: { clerkId: clerkUserId },
                update: {},
            });

            const s3Key = `replays/${dbUser.id}/${randomUUID()}.slp`;
            const slpFileUrl = await uploadReplayToS3(req.file.buffer, s3Key);

            let parsedData;
            try {
                parsedData = parseReplayBuffer(req.file.buffer);
            } catch (parseError) {
                res.status(422).json({
                    error: parseError instanceof Error
                        ? parseError.message
                        : "Failed to parse replay file",
                });
                return;
            }

            const userPlayerMatch = parsedData.players.find(
                (player) => player.connectCode?.toUpperCase() === normalizedUserConnectCode,
            );

            if (!userPlayerMatch) {
                res.status(422).json({
                    error: `Connect code "${userConnectCode}" was not found in this replay. Offline replays without connect codes are not supported.`,
                });
                return;
            }

            const createdGame = await prisma.$transaction(async (tx) => {
                const game = await tx.game.create({
                    data: {
                        userId: dbUser.id,
                        stage: parsedData.stage,
                        duration: parsedData.duration,
                        playedAt: parsedData.playedAt,
                        slpFileUrl,
                    },
                });

                await Promise.all(
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

                return game;
            });

            res.status(201).json({
                gameId: createdGame.id,
                stage: parsedData.stage,
                duration: parsedData.duration,
                playedAt: parsedData.playedAt,
                players: parsedData.players.map((player) => ({
                    port: player.port,
                    character: player.characterName,
                    connectCode: player.connectCode,
                    isUser: player.connectCode?.toUpperCase() === normalizedUserConnectCode,
                })),
            });
        } catch (error) {
            console.error("Failed to process replay upload:", error);
            res.status(500).json({ error: "Failed to process replay upload" });
        }
    },
);

replaysRouter.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File exceeds the 50MB size limit" });
        return;
    }
    next(err);
});

export { replaysRouter };
