-- CreateTable
CREATE TABLE "courier_shipments" (
    "id" SERIAL NOT NULL,
    "orderName" TEXT NOT NULL,
    "courierName" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "trackingCode" TEXT,
    "trackingLink" TEXT,
    "status" TEXT,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_shipments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_orderName_fkey" FOREIGN KEY ("orderName") REFERENCES "Order"("orderName") ON DELETE CASCADE ON UPDATE CASCADE;
