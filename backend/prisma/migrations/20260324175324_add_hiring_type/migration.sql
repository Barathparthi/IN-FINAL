-- CreateEnum
CREATE TYPE "HiringType" AS ENUM ('CAMPUS', 'LATERAL');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "hiringType" "HiringType" NOT NULL DEFAULT 'LATERAL';

-- CreateIndex
CREATE INDEX "Campaign_hiringType_idx" ON "Campaign"("hiringType");
