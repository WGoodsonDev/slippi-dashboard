-- CreateEnum
CREATE TYPE "Gamestate" AS ENUM ('NEUTRAL', 'HITSTUN', 'LEDGE', 'OFFSTAGE', 'DEAD');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "slp_file_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "is_user" BOOLEAN NOT NULL,
    "character" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "connect_code" TEXT NOT NULL,
    "slippi_rank" TEXT,
    "end_stocks" INTEGER NOT NULL,
    "end_percent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combos" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "comboing_player_id" TEXT NOT NULL,
    "comboed_player_id" TEXT NOT NULL,
    "start_percent" DOUBLE PRECISION NOT NULL,
    "end_percent" DOUBLE PRECISION NOT NULL,
    "led_to_ko" BOOLEAN NOT NULL,
    "hit_count" INTEGER NOT NULL,

    CONSTRAINT "combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_hits" (
    "id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "move" TEXT NOT NULL,
    "comboing_x" DOUBLE PRECISION NOT NULL,
    "comboing_y" DOUBLE PRECISION NOT NULL,
    "comboed_x" DOUBLE PRECISION NOT NULL,
    "comboed_y" DOUBLE PRECISION NOT NULL,
    "percent_before" DOUBLE PRECISION NOT NULL,
    "percent_after" DOUBLE PRECISION NOT NULL,
    "knockback_strength" DOUBLE PRECISION NOT NULL,
    "knockback_angle" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "combo_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamestate_segments" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "perspective_player_id" TEXT NOT NULL,
    "gamestate" "Gamestate" NOT NULL,
    "start_frame" INTEGER NOT NULL,
    "end_frame" INTEGER NOT NULL,

    CONSTRAINT "gamestate_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_samples" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "frame" INTEGER NOT NULL,

    CONSTRAINT "position_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combos" ADD CONSTRAINT "combos_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combos" ADD CONSTRAINT "combos_comboing_player_id_fkey" FOREIGN KEY ("comboing_player_id") REFERENCES "game_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combos" ADD CONSTRAINT "combos_comboed_player_id_fkey" FOREIGN KEY ("comboed_player_id") REFERENCES "game_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_hits" ADD CONSTRAINT "combo_hits_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamestate_segments" ADD CONSTRAINT "gamestate_segments_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamestate_segments" ADD CONSTRAINT "gamestate_segments_perspective_player_id_fkey" FOREIGN KEY ("perspective_player_id") REFERENCES "game_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_samples" ADD CONSTRAINT "position_samples_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "gamestate_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_samples" ADD CONSTRAINT "position_samples_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "game_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
