-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vin" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "odometer" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleVin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceRecommendation_vehicleVin_fkey" FOREIGN KEY ("vehicleVin") REFERENCES "Vehicle" ("vin") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleVin" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    CONSTRAINT "VehicleEvent_vehicleVin_fkey" FOREIGN KEY ("vehicleVin") REFERENCES "Vehicle" ("vin") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "ServiceRecommendation_vehicleVin_idx" ON "ServiceRecommendation"("vehicleVin");

-- CreateIndex
CREATE INDEX "ServiceRecommendation_status_idx" ON "ServiceRecommendation"("status");

-- CreateIndex
CREATE INDEX "VehicleEvent_vehicleVin_idx" ON "VehicleEvent"("vehicleVin");

-- CreateIndex
CREATE INDEX "VehicleEvent_type_idx" ON "VehicleEvent"("type");

-- CreateIndex
CREATE INDEX "VehicleEvent_createdAt_idx" ON "VehicleEvent"("createdAt");
