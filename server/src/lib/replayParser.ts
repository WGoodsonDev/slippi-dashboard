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

type SlippiGameInstance = InstanceType<typeof SlippiJsTypes.SlippiGame>;
type FramesData = ReturnType<SlippiGameInstance["getFrames"]>;
type GameStats = NonNullable<ReturnType<SlippiGameInstance["getStats"]>>;

interface ParsedPlayer {
    port: number;
    characterName: string;
    connectCode: string | null;
    endStocks: number;
    endPercent: number;
}

interface ParsedComboHit {
    sequenceNumber: number;
    moveId: number;
    comboingX: number;
    comboingY: number;
    comboedX: number;
    comboedY: number;
    percentBefore: number;
    percentAfter: number;
    knockbackStrength: number;
    knockbackAngle: number;
}

interface ParsedCombo {
    comboingPlayerPort: number;
    comboedPlayerPort: number;
    startPercent: number;
    endPercent: number;
    ledToKo: boolean;
    hits: ParsedComboHit[];
}

interface ParsedReplayData {
    stage: string;
    duration: number;
    playedAt: Date;
    players: ParsedPlayer[];
    combos: ParsedCombo[];
}

function resolvePlayerPosition(
    frames: FramesData,
    frameNumber: number,
    playerIndex: number,
): { x: number; y: number } {
    const playerFrameData = frames[frameNumber]?.players[playerIndex];
    return {
        x: playerFrameData?.post.positionX ?? 0,
        y: playerFrameData?.post.positionY ?? 0,
    };
}

function buildParsedCombos(
    stats: GameStats,
    frames: FramesData,
    playerPortByIndex: Map<number, number>,
): ParsedCombo[] {
    const parsedCombos: ParsedCombo[] = [];

    for (const combo of stats.combos) {
        if (combo.lastHitBy === null || combo.lastHitBy === undefined) {
            continue;
        }

        const comboingPlayerPort = playerPortByIndex.get(combo.lastHitBy);
        const comboedPlayerPort = playerPortByIndex.get(combo.playerIndex);

        if (comboingPlayerPort === undefined || comboedPlayerPort === undefined) {
            continue;
        }

        let runningPercent = combo.startPercent;
        const hits: ParsedComboHit[] = combo.moves.map((move, index) => {
            const percentBefore = runningPercent;
            const percentAfter = runningPercent + move.damage;
            runningPercent = percentAfter;

            const comboingPosition = resolvePlayerPosition(
                frames,
                move.frame,
                combo.lastHitBy as number,
            );
            const comboedPosition = resolvePlayerPosition(
                frames,
                move.frame,
                combo.playerIndex,
            );

            return {
                sequenceNumber: index,
                moveId: move.moveId,
                comboingX: comboingPosition.x,
                comboingY: comboingPosition.y,
                comboedX: comboedPosition.x,
                comboedY: comboedPosition.y,
                percentBefore,
                percentAfter,
                knockbackStrength: 0,
                knockbackAngle: 0,
            };
        });

        parsedCombos.push({
            comboingPlayerPort,
            comboedPlayerPort,
            startPercent: combo.startPercent,
            endPercent: combo.endPercent ?? runningPercent,
            ledToKo: combo.didKill ?? false,
            hits,
        });
    }

    return parsedCombos;
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
    const frames = game.getFrames();

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

    const playerPortByIndex = new Map(
        humanPlayers.map((player) => [player.playerIndex, player.port]),
    );
    const combos = buildParsedCombos(stats, frames, playerPortByIndex);

    return {
        stage,
        duration,
        playedAt,
        players: parsedPlayers,
        combos,
    };
}

export type { ParsedReplayData, ParsedPlayer, ParsedCombo, ParsedComboHit };
export { parseReplayBuffer };
