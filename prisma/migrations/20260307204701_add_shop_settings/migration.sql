-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "fetchLimit" INTEGER NOT NULL DEFAULT 100,
    "reportLimit" INTEGER NOT NULL DEFAULT 10,
    "fraudspyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "steadfastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allSources" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);
