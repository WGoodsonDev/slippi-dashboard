import { createRequire } from "module";
// The @slippi/slippi-js ESM build imports lodash subpaths without .js extensions,
// which Node 24 rejects. createRequire loads the CJS build instead, which has no
// this issue. The type-only import gives us the declaration file types without
// triggering the broken ESM load.
import type * as SlippiJsTypes from "@slippi/slippi-js/node";

const nodeRequire = createRequire(import.meta.url);
const { SlippiGame, characters, stages, State } = nodeRequire(
    "@slippi/slippi-js/node",
) as typeof SlippiJsTypes;

const HUMAN_PLAYER_TYPE = 0;

// Action state range covering all cliff/ledge states (CliffCatch through CliffJumpQuick2).
// slippi-js only exposes CLIFF_CATCH (252) as a named constant; the upper end is derived
// from the Melee action state table.
const CLIFF_LEDGE_END = 263;

// Stage edge x-coordinates (absolute value) for the 6 tournament-legal stages.
// OFFSTAGE is defined as: airborne and abs(positionX) > this threshold.
// Only tournament stages are included — replays from non-standard stages will not
// produce OFFSTAGE segments (falling through to NEUTRAL), which is an accepted constraint.
const STAGE_EDGE_X: Record<number, number> = {
    2: 63.35,   // Fountain of Dreams
    8: 56.0,    // Yoshi's Story
    18: 87.75,  // Pokemon Stadium
    28: 77.27,  // Dream Land N64
    31: 68.4,   // Battlefield
    32: 85.56,  // Final Destination
};

type SlippiGameInstance = InstanceType<typeof SlippiJsTypes.SlippiGame>;
type FramesData = ReturnType<SlippiGameInstance["getFrames"]>;
type GameStats = NonNullable<ReturnType<SlippiGameInstance["getStats"]>>;

// Structural snapshot of the post-frame fields used for gamestate classification.
// Defined locally rather than importing the full slippi-js type to avoid coupling
// to the library's internal type structure.
interface PostFrameSnapshot {
    actionStateId: number | null | undefined;
    positionX: number | null | undefined;
    isAirborne: boolean | null | undefined;
}

type GamestateValue = "NEUTRAL" | "HITSTUN" | "LEDGE" | "OFFSTAGE" | "DEAD";

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

interface ParsedPositionSample {
    x: number;
    y: number;
    frame: number;
}

interface ParsedGamestateSegment {
    playerPort: number;
    gamestate: GamestateValue;
    startFrame: number;
    endFrame: number;
    positionSamples: ParsedPositionSample[];
}

interface ParsedReplayData {
    stage: string;
    duration: number;
    playedAt: Date;
    players: ParsedPlayer[];
    combos: ParsedCombo[];
    gamestateSegments: ParsedGamestateSegment[];
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

// Classifies a single frame for one player into one of the five v1 gamestates.
// Priority: DEAD > HITSTUN > LEDGE > OFFSTAGE > NEUTRAL. A player being hit
// offstage stays in HITSTUN, not OFFSTAGE — the priority order enforces this.
function classifyGamestate(
    post: PostFrameSnapshot,
    stageEdgeX: number | undefined,
): GamestateValue {
    const { actionStateId, positionX, isAirborne } = post;

    if (typeof actionStateId !== "number") {
        return "NEUTRAL";
    }

    if (actionStateId >= State.DYING_START && actionStateId <= State.DYING_END) {
        return "DEAD";
    }

    if (
        actionStateId === State.DAMAGE_FALL ||
        (actionStateId >= State.DAMAGE_START && actionStateId <= State.DAMAGE_END)
    ) {
        return "HITSTUN";
    }

    if (actionStateId >= State.CLIFF_CATCH && actionStateId <= CLIFF_LEDGE_END) {
        return "LEDGE";
    }

    if (
        stageEdgeX !== undefined &&
        isAirborne === true &&
        typeof positionX === "number" &&
        Math.abs(positionX) > stageEdgeX
    ) {
        return "OFFSTAGE";
    }

    return "NEUTRAL";
}

// Iterates all game frames (frame >= 0) for each player, emitting a segment
// whenever the gamestate changes. Position is sampled every 6th frame within
// each active segment. The final open segment is closed at the last frame.
function buildGamestateSegments(
    frames: FramesData,
    humanPlayers: SlippiJsTypes.PlayerType[],
    stageId: number,
): ParsedGamestateSegment[] {
    const stageEdgeX = STAGE_EDGE_X[stageId];
    const segments: ParsedGamestateSegment[] = [];

    const gameFrameNumbers = Object.keys(frames)
        .map(Number)
        .filter((frame) => frame >= 0)
        .sort((a, b) => a - b);

    for (const player of humanPlayers) {
        let currentGamestate: GamestateValue | null = null;
        let currentStartFrame = 0;
        let currentSamples: ParsedPositionSample[] = [];

        for (const frameNumber of gameFrameNumbers) {
            const playerFrameData = frames[frameNumber]?.players[player.playerIndex];
            if (!playerFrameData) continue;

            const gamestate = classifyGamestate(playerFrameData.post, stageEdgeX);

            if (gamestate !== currentGamestate) {
                if (currentGamestate !== null) {
                    segments.push({
                        playerPort: player.port,
                        gamestate: currentGamestate,
                        startFrame: currentStartFrame,
                        endFrame: frameNumber - 1,
                        positionSamples: currentSamples,
                    });
                }
                currentGamestate = gamestate;
                currentStartFrame = frameNumber;
                currentSamples = [];
            }

            if (frameNumber % 6 === 0) {
                currentSamples.push({
                    x: playerFrameData.post.positionX ?? 0,
                    y: playerFrameData.post.positionY ?? 0,
                    frame: frameNumber,
                });
            }
        }

        // Close the final open segment
        if (currentGamestate !== null && gameFrameNumbers.length > 0) {
            segments.push({
                playerPort: player.port,
                gamestate: currentGamestate,
                startFrame: currentStartFrame,
                endFrame: gameFrameNumbers[gameFrameNumbers.length - 1],
                positionSamples: currentSamples,
            });
        }
    }

    return segments;
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
    const gamestateSegments = buildGamestateSegments(frames, humanPlayers, settings.stageId);

    return {
        stage,
        duration,
        playedAt,
        players: parsedPlayers,
        combos,
        gamestateSegments,
    };
}

export type {
    ParsedReplayData,
    ParsedPlayer,
    ParsedCombo,
    ParsedComboHit,
    ParsedGamestateSegment,
    ParsedPositionSample,
};
export { parseReplayBuffer };
