/*
  Warnings:

  - A unique constraint covering the columns `[orderName]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Order_orderId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderName_key" ON "Order"("orderName");
