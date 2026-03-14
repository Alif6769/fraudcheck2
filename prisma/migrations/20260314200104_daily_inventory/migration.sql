/*
  Warnings:

  - The `updatedAt` column on the `CancelledOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `cancelledAt` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `updatedAt` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `updatedAt` column on the `UnfulfilledOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `cancelledAt` column on the `UnfulfilledOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `cancelledAt` on the `CancelledOrder` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "CancelledOrder" DROP COLUMN "updatedAt",
ADD COLUMN     "updatedAt" TIMESTAMP(3),
DROP COLUMN "cancelledAt",
ADD COLUMN     "cancelledAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "cancelledAt",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
DROP COLUMN "updatedAt",
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UnfulfilledOrder" DROP COLUMN "updatedAt",
ADD COLUMN     "updatedAt" TIMESTAMP(3),
DROP COLUMN "cancelledAt",
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
