-- CreateEnum
CREATE TYPE "UnmatchedTransferReason" AS ENUM ('NO_ORDER', 'AMOUNT_MISMATCH', 'ORDER_CLOSED');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'SEPAY';

-- CreateTable
CREATE TABLE "UnmatchedTransfer" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "reason" "UnmatchedTransferReason" NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "orderCode" TEXT,
    "bankAccount" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmatchedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnmatchedTransfer_resolvedAt_createdAt_idx" ON "UnmatchedTransfer"("resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedTransfer_provider_externalId_key" ON "UnmatchedTransfer"("provider", "externalId");
