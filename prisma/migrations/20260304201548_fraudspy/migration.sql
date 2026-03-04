-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fraudReport" TEXT,
ADD COLUMN     "realName" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "steadFastReport" TEXT,
ALTER COLUMN "orderName" DROP DEFAULT;
