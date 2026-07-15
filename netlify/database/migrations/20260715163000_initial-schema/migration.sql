-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'comercial',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "cif" TEXT NOT NULL,
    "fiscalAddress" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sector" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "validUntil" TEXT,
    "description" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSurcharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaPercent" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "ivaAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFinal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clientNotes" TEXT,
    "internalNotes" TEXT,
    "serviceLocationId" TEXT NOT NULL DEFAULT 'madrid-capital',
    "serviceAutonomousCommunity" TEXT NOT NULL DEFAULT 'Madrid',
    "serviceProvince" TEXT NOT NULL DEFAULT 'Madrid',
    "serviceMunicipality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBlock" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "professionalCategory" TEXT NOT NULL,
    "professionalsRequested" INTEGER NOT NULL DEFAULT 1,
    "pricePerHour" DOUBLE PRECISION NOT NULL,
    "internalCostPerHour" DOUBLE PRECISION,
    "internalMargin" DOUBLE PRECISION,
    "contractType" TEXT,
    "blockType" TEXT,
    "dateUIMode" TEXT,
    "dateMode" TEXT NOT NULL DEFAULT 'range',
    "specificDates" TEXT,
    "dateRangeStart" TEXT,
    "dateRangeEnd" TEXT,
    "daysOfWeek" TEXT,
    "excludeSundays" BOOLEAN NOT NULL DEFAULT false,
    "excludeHolidays" BOOLEAN NOT NULL DEFAULT false,
    "holidayTypesExcluded" TEXT,
    "shiftType" TEXT NOT NULL DEFAULT 'morning',
    "shiftStartTime" TEXT,
    "shiftEndTime" TEXT,
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "unitType" TEXT NOT NULL DEFAULT 'hora',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fixedPrice" DOUBLE PRECISION,
    "courseName" TEXT,
    "courseTeacher" TEXT,
    "courseModality" TEXT,
    "courseSessions" INTEGER,
    "materialName" TEXT,
    "accommodationNights" DOUBLE PRECISION,
    "accommodationPersons" DOUBLE PRECISION,
    "transportType" TEXT,
    "totalWorkingDays" INTEGER NOT NULL DEFAULT 0,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSurcharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minProfessionals" INTEGER NOT NULL DEFAULT 1,
    "selectedProfessionals" INTEGER NOT NULL DEFAULT 1,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blockSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabledSurcharges" TEXT,
    "surchargeBreakdown" TEXT,
    "laborWarnings" TEXT,
    "observations" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetHistory" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "snapshot" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPricePerHour" DOUBLE PRECISION NOT NULL,
    "defaultInternalCost" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurchargeConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "surchargeType" TEXT NOT NULL DEFAULT 'percentage',
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurchargeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'nacional',
    "autonomousCommunity" TEXT,
    "province" TEXT,
    "municipality" TEXT,
    "year" INTEGER,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxWeeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "maxDailyHours" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "minRestBetweenShiftsH" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 6,
    "nightStartHour" INTEGER NOT NULL DEFAULT 22,
    "nightEndHour" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingQuote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT,
    "snapshot" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "ivaPercent" DOUBLE PRECISION NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "totalFinal" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "summary" TEXT,
    "oldData" TEXT,
    "newData" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "appVersion" TEXT,
    "engineVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "location" TEXT,
    "reference" TEXT,
    "eliUrl" TEXT,
    "officialUrl" TEXT,
    "hasLiteralQuote" BOOLEAN NOT NULL DEFAULT false,
    "literalQuote" TEXT,
    "quoteSource" TEXT,
    "operativeSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendiente_revision',
    "sourceType" TEXT NOT NULL DEFAULT 'boe',
    "reviewDate" TEXT,
    "internalNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalParameter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "category" TEXT NOT NULL,
    "effectiveFrom" TEXT,
    "effectiveTo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "legalRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "role" TEXT,
    "oldVersion" TEXT,
    "newVersion" TEXT,
    "changesApplied" TEXT,
    "fileSource" TEXT,
    "result" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_code_key" ON "Budget"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalCategory_name_key" ON "ProfessionalCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SurchargeConfig_name_key" ON "SurchargeConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRule_name_key" ON "LaborRule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");

-- CreateIndex
CREATE INDEX "CostingQuote_budgetId_idx" ON "CostingQuote"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRecord_key_key" ON "LegalRecord"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LegalParameter_key_key" ON "LegalParameter"("key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBlock" ADD CONSTRAINT "ServiceBlock_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetHistory" ADD CONSTRAINT "BudgetHistory_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetHistory" ADD CONSTRAINT "BudgetHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalParameter" ADD CONSTRAINT "LegalParameter_legalRecordId_fkey" FOREIGN KEY ("legalRecordId") REFERENCES "LegalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

