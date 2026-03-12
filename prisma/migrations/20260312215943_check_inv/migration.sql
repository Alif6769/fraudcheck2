-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "productIds" JSONB;

-- CreateTable
CREATE TABLE "ProcessedOrderRange" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "fromDateTime" TIMESTAMP(3) NOT NULL,
    "toDateTime" TIMESTAMP(3) NOT NULL,
    "processedOrdersCount" INTEGER NOT NULL,
    "processedOrderNameFrom" TEXT,
    "processedOrderNameTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedOrderRange_pkey" PRIMARY KEY ("id")
);
