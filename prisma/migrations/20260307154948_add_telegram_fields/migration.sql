/*
  Warnings:

  - You are about to drop the column `realName` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "realName",
ADD COLUMN     "realName1" TEXT,
ADD COLUMN     "realName2" TEXT;
