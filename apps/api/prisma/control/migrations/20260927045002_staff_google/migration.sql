-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_googleId_key" ON "StaffUser"("googleId");

