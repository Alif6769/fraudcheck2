-- CreateTable
CREATE TABLE "courier_services" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tracking_url_pattern" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_courier_credentials" (
    "id" BIGSERIAL NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "courier_service_id" BIGINT NOT NULL,
    "credentials" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "store_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_courier_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_services_name_key" ON "courier_services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_courier_credentials_shop_domain_courier_service_id_key" ON "shop_courier_credentials"("shop_domain", "courier_service_id");

-- AddForeignKey
ALTER TABLE "shop_courier_credentials" ADD CONSTRAINT "shop_courier_credentials_courier_service_id_fkey" FOREIGN KEY ("courier_service_id") REFERENCES "courier_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
