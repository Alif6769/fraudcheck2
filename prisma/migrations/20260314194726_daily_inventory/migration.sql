-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TEXT,
ADD COLUMN     "updatedAt" TEXT;

-- CreateTable
CREATE TABLE "UnfulfilledOrder" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderTime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TEXT,
    "cancelledAt" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfillmentStatus" TEXT,
    "customerId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "contactPhone" TEXT,
    "shippingPhone" TEXT,
    "shippingAddress" TEXT,
    "totalPrice" TEXT NOT NULL,
    "shippingFee" TEXT NOT NULL,
    "products" JSONB NOT NULL,
    "productIds" JSONB,
    "source" TEXT,

    CONSTRAINT "UnfulfilledOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelledOrder" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderTime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TEXT,
    "cancelledAt" TEXT NOT NULL,
    "fromDateTime" TIMESTAMP(3) NOT NULL,
    "toDateTime" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "contactPhone" TEXT,
    "shippingPhone" TEXT,
    "shippingAddress" TEXT,
    "totalPrice" TEXT NOT NULL,
    "shippingFee" TEXT NOT NULL,
    "products" JSONB NOT NULL,
    "productIds" JSONB,
    "source" TEXT,

    CONSTRAINT "CancelledOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyInventorySnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "shop" TEXT NOT NULL,
    "description" TEXT,
    "inventoryCategory" TEXT,
    "productCategory" TEXT,
    "isCombo" BOOLEAN NOT NULL DEFAULT false,
    "rawProductFlag" BOOLEAN NOT NULL DEFAULT false,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "rootProductId" TEXT,
    "comboReference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "todayDateTime" TIMESTAMP(3),
    "fulfilledSales" INTEGER NOT NULL DEFAULT 0,
    "fulfilledManual" INTEGER NOT NULL DEFAULT 0,
    "fulfilledReturn" INTEGER NOT NULL DEFAULT 0,
    "fulfilledDamage" INTEGER NOT NULL DEFAULT 0,
    "unfulfilledSales" INTEGER NOT NULL DEFAULT 0,
    "unfulfilledManual" INTEGER NOT NULL DEFAULT 0,
    "unfulfilledReturn" INTEGER NOT NULL DEFAULT 0,
    "unfulfilledDamage" INTEGER NOT NULL DEFAULT 0,
    "cancelledSales" INTEGER NOT NULL DEFAULT 0,
    "cancelledManual" INTEGER NOT NULL DEFAULT 0,
    "cancelledReturn" INTEGER NOT NULL DEFAULT 0,
    "cancelledDamage" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyInventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnfulfilledOrder_orderName_key" ON "UnfulfilledOrder"("orderName");

-- CreateIndex
CREATE UNIQUE INDEX "CancelledOrder_orderName_key" ON "CancelledOrder"("orderName");

-- CreateIndex
CREATE UNIQUE INDEX "DailyInventorySnapshot_productId_key" ON "DailyInventorySnapshot"("productId");
