-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "BannerStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_HERO', 'CATEGORY_PAGE', 'CHECKOUT');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "tenantId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HOME_HERO',
    "status" "BannerStatus" NOT NULL DEFAULT 'DRAFT',
    "gradientFrom" TEXT NOT NULL DEFAULT '#0F5132',
    "gradientTo" TEXT NOT NULL DEFAULT '#166534',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "PlatformBanner_status_idx" ON "PlatformBanner"("status");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBanner" ADD CONSTRAINT "PlatformBanner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
