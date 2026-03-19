import { createRequire } from "module";
// The @slippi/slippi-js ESM build imports lodash subpaths without .js extensions,
// which Node 24 rejects. createRequire loads the CJS build instead, which has no
// this issue. The type-only import gives us the declaration file types without
// triggering the broken ESM load.
import type * as SlippiJsTypes from "@slippi/slippi-js/node";

const nodeRequire = createRequire(import.meta.url);
const { SlippiGame, characters, stages } = nodeRequire(
    "@slippi/slippi-js/node",
) as typeof SlippiJsTypes;

const HUMAN_PLAYER_TYPE = 0;

interface ParsedPlayer {
    port: number;
    characterName: string;
    connectCode: string | null;
    endStocks: number;
    endPercent: number;
}

interface ParsedReplayData {
    stage: string;
    duration: number;
    playedAt: Date;
    players: ParsedPlayer[];
}

function parseReplayBuffer(fileBuffer: Buffer): ParsedReplayData {
    const game = new SlippiGame(fileBuffer);

    const settings = game.getSettings();
    if (!settings) {
        throw new Error("Failed to read game settings from replay file");
    }

    const stats = game.getStats();
    if (!stats) {
        throw new Error("Failed to compute game stats from replay file");
    }

    const metadata = game.getMetadata();

    if (settings.stageId === undefined) {
        throw new Error("Replay file is missing stage data");
    }
    const stage = stages.getStageName(settings.stageId);

    const duration = stats.lastFrame;
    const playedAt = metadata?.startAt ? new Date(metadata.startAt) : new Date();

    const humanPlayers = settings.players.filter(
        (player) => player.type === HUMAN_PLAYER_TYPE,
    );
    if (humanPlayers.length !== 2) {
        throw new Error(
            `Expected 2 human players, found ${humanPlayers.length}. CPU and non-VS replays are not supported.`,
        );
    }

    const parsedPlayers: ParsedPlayer[] = humanPlayers.map((player) => {
        const playerStocks = stats.stocks.filter(
            (stock) => stock.playerIndex === player.playerIndex,
        );

        const endStocks = playerStocks.filter(
            (stock) => stock.endFrame === undefined || stock.endFrame === null,
        ).length;

        const lastStock = playerStocks[playerStocks.length - 1];
        const endPercent = lastStock?.endPercent ?? lastStock?.currentPercent ?? 0;

        const characterName =
            player.characterId !== undefined
                ? characters.getCharacterName(player.characterId)
                : "Unknown";

        const connectCode =
            player.connectCode && player.connectCode.length > 0
                ? player.connectCode
                : null;

        return {
            port: player.port,
            characterName,
            connectCode,
            endStocks,
            endPercent,
        };
    });

    return {
        stage,
        duration,
        playedAt,
        players: parsedPlayers,
    };
}

export type { ParsedReplayData, ParsedPlayer };
export { parseReplayBuffer };