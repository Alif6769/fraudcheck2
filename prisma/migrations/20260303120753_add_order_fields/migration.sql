-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "name" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "subtotalPrice" DOUBLE PRECISION,
    "totalTax" DOUBLE PRECISION,
    "currency" TEXT,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "cancelReason" TEXT,
    "customerEmail" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "customerId" TEXT,
    "shippingPhone" TEXT,
    "customerFullName" TEXT,
    "shippingAddress" TEXT,
    "billingAddress" TEXT,
    "customerTotalOrders" INTEGER,
    "customerFulfilledOrders" INTEGER,
    "lineItems" TEXT,
    "discountCodes" TEXT,
    "shippingLines" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "rawData" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_shop_key" ON "Order"("orderId", "shop");
