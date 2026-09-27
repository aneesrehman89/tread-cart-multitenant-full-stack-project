-- AlterTable
ALTER TABLE "SellerApplication" DROP COLUMN "kycBackKey",
DROP COLUMN "kycDocType",
DROP COLUMN "kycFrontKey",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SellerApplication_googleId_key" ON "SellerApplication"("googleId");

