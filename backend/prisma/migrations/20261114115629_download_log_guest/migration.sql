-- AlterTable
ALTER TABLE "DownloadLog" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DownloadLog_ip_createdAt_idx" ON "DownloadLog"("ip", "createdAt");
