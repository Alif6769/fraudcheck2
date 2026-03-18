-- AlterTable
ALTER TABLE "courier_shipments" ALTER COLUMN "consignmentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "courier_order_holds" (
    "id" SERIAL NOT NULL,
    "orderName" TEXT NOT NULL,
    "courierName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_order_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_order_holds_orderName_courierName_key" ON "courier_order_holds"("orderName", "courierName");

-- AddForeignKey
ALTER TABLE "courier_order_holds" ADD CONSTRAINT "courier_order_holds_orderName_fkey" FOREIGN KEY ("orderName") REFERENCES "Order"("orderName") ON DELETE CASCADE ON UPDATE CASCADE;
