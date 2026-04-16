-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "delivery_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "delivery_address" TEXT,
ADD COLUMN "delivery_fee" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "portal_checkouts" ADD COLUMN "delivery_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "delivery_address" TEXT,
ADD COLUMN "delivery_fee" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "portal_checkout_items" (
    "id" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "batch_egg_code_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "portal_checkout_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "portal_checkout_items" ADD CONSTRAINT "portal_checkout_items_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "portal_checkouts"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_checkout_items" ADD CONSTRAINT "portal_checkout_items_batch_egg_code_id_fkey" FOREIGN KEY ("batch_egg_code_id") REFERENCES "batch_egg_codes"("id");
