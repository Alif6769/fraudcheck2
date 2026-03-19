-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'RESTOCK';

-- AlterTable
ALTER TABLE "DailyInventorySnapshot" ADD COLUMN     "inventory" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restocked" INTEGER NOT NULL DEFAULT 0;
