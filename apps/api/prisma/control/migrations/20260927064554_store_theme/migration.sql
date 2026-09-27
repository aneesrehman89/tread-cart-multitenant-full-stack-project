-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "buttonStyle" TEXT NOT NULL DEFAULT 'rounded',
ADD COLUMN     "buttonWeight" TEXT NOT NULL DEFAULT 'solid',
ADD COLUMN     "cardStyle" TEXT NOT NULL DEFAULT 'soft',
ADD COLUMN     "fontFamily" TEXT NOT NULL DEFAULT 'inter';

