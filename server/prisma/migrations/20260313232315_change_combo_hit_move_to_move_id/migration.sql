/*
  Warnings:

  - You are about to drop the column `move` on the `combo_hits` table. All the data in the column will be lost.
  - Added the required column `move_id` to the `combo_hits` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "combo_hits" DROP COLUMN "move",
ADD COLUMN     "move_id" INTEGER NOT NULL;
