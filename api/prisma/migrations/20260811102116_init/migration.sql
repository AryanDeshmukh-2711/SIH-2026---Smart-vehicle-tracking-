-- PostGIS must exist before any geometry column is declared. This also makes
-- the migration self-contained: Prisma validates migrations against a throwaway
-- shadow database that does not inherit the postgis image's preinstalled
-- extensions, so without this the geometry type is unknown there.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "stop_kind" AS ENUM ('isbt', 'bus_stand', 'stop', 'halt');

-- CreateEnum
CREATE TYPE "route_category" AS ENUM ('ordinary', 'express', 'deluxe', 'volvo', 'local');

-- CreateEnum
CREATE TYPE "fuel_type" AS ENUM ('electric', 'cng', 'hybrid', 'diesel');

-- CreateEnum
CREATE TYPE "emission_norm" AS ENUM ('zero_tailpipe', 'BS_VI', 'BS_IV', 'BS_III');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('scheduled', 'running', 'delayed', 'cancelled', 'signal_lost', 'ended');

-- CreateEnum
CREATE TYPE "confidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "alert_kind" AS ENUM ('delay', 'cancellation', 'route_change', 'road_closure', 'weather', 'stop_change', 'arrival');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('info', 'warning', 'severe');

-- CreateTable
CREATE TABLE "stops" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "kind" "stop_kind" NOT NULL,
    "town" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "landmarks" TEXT[],
    "platforms" TEXT[],
    "amenities" TEXT[],
    "sms_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "long_name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "category" "route_category" NOT NULL,
    "operator" TEXT NOT NULL,
    "shape" geometry(LineString, 4326),
    "distance_km" DOUBLE PRECISION NOT NULL,
    "typical_duration_min" INTEGER NOT NULL,
    "fare_inr" INTEGER NOT NULL,
    "departures" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "distance_km" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "fuel" "fuel_type" NOT NULL,
    "norm" "emission_norm" NOT NULL,
    "year" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL,
    "wheelchair_accessible" BOOLEAN NOT NULL DEFAULT false,
    "amenities" TEXT[],
    "emission_data_estimated" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "bus_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "scheduled_at" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "status" "trip_status" NOT NULL DEFAULT 'scheduled',
    "delay_min" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_locations" (
    "id" BIGSERIAL NOT NULL,
    "bus_id" TEXT NOT NULL,
    "trip_id" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "matched_lat" DOUBLE PRECISION,
    "matched_lng" DOUBLE PRECISION,
    "progress_km" DOUBLE PRECISION,
    "speed_kmph" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buffered" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'mqtt',

    CONSTRAINT "bus_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eta_predictions" (
    "id" BIGSERIAL NOT NULL,
    "trip_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "eta_seconds" INTEGER NOT NULL,
    "range_low_sec" INTEGER NOT NULL,
    "range_high_sec" INTEGER NOT NULL,
    "confidence" "confidence" NOT NULL,
    "data_age_sec" INTEGER NOT NULL,
    "from_timetable" BOOLEAN NOT NULL DEFAULT false,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eta_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "kind" "alert_kind" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route_id" TEXT,
    "stop_ids" TEXT[],
    "source" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stops_code_key" ON "stops"("code");

-- CreateIndex
CREATE INDEX "stops_town_idx" ON "stops"("town");

-- CreateIndex
CREATE INDEX "routes_short_name_idx" ON "routes"("short_name");

-- CreateIndex
CREATE INDEX "route_stops_stop_id_idx" ON "route_stops"("stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_sequence_key" ON "route_stops"("route_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "buses_registration_key" ON "buses"("registration");

-- CreateIndex
CREATE INDEX "buses_route_id_idx" ON "buses"("route_id");

-- CreateIndex
CREATE INDEX "trips_route_id_status_idx" ON "trips"("route_id", "status");

-- CreateIndex
CREATE INDEX "trips_bus_id_status_idx" ON "trips"("bus_id", "status");

-- CreateIndex
CREATE INDEX "bus_locations_bus_id_recorded_at_idx" ON "bus_locations"("bus_id", "recorded_at");

-- CreateIndex
CREATE INDEX "bus_locations_trip_id_recorded_at_idx" ON "bus_locations"("trip_id", "recorded_at");

-- CreateIndex
CREATE INDEX "eta_predictions_trip_id_stop_id_calculated_at_idx" ON "eta_predictions"("trip_id", "stop_id", "calculated_at");

-- CreateIndex
CREATE INDEX "alerts_route_id_issued_at_idx" ON "alerts"("route_id", "issued_at");

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_locations" ADD CONSTRAINT "bus_locations_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_locations" ADD CONSTRAINT "bus_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eta_predictions" ADD CONSTRAINT "eta_predictions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eta_predictions" ADD CONSTRAINT "eta_predictions_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
