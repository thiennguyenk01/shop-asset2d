-- AlterTable
ALTER TABLE "UnmatchedTransfer" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "UnmatchedTransfer" ADD CONSTRAINT "UnmatchedTransfer_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
