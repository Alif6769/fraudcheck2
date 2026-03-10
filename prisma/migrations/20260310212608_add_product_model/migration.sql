/*
  Warnings:

  - You are about to drop the column `inventoryWarningLevel` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `shortForm` on the `Product` table. All the data in the column will be lost.
  - The `comboReference` column on the `Product` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Adjustment` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RETURN', 'DAMAGE', 'MANUAL_SALE');

-- DropForeignKey
ALTER TABLE "Adjustment" DROP CONSTRAINT "Adjustment_productId_fkey";

-- AlterTable
ALTER TABLE "InventoryDaily" ALTER COLUMN "closingInventory" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "inventoryWarningLevel",
DROP COLUMN "shortForm",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "comboReference",
ADD COLUMN     "comboReference" JSONB;

-- DropTable
DROP TABLE "Adjustment";

-- CreateTable
CREATE TABLE "ProductTransaction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductTransaction" ADD CONSTRAINT "ProductTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;
