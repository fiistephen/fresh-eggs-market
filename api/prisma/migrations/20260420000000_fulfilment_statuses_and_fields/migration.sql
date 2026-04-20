-- Add new fulfilment statuses to BookingStatus enum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_PICKUP';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_DELIVERY';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- Add fulfilment tracking fields to bookings
ALTER TABLE "bookings" ADD COLUMN "fulfilment_type" TEXT;
ALTER TABLE "bookings" ADD COLUMN "ready_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "dispatched_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "driver_name" TEXT;
ALTER TABLE "bookings" ADD COLUMN "completed_at" TIMESTAMP(3);
