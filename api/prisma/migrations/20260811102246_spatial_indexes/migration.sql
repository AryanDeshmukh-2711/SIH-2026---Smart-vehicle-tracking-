-- Spatial indexes and geometry consistency.
--
-- Prisma cannot express GiST indexes or triggers, so the spatial half of the
-- schema is defined here. Without these, "stops within 2 km of me" degrades to a
-- sequential scan over every stop in the state.

-- ---------------------------------------------------------------- indexes --
CREATE INDEX IF NOT EXISTS stops_geom_idx ON "stops" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS routes_shape_idx ON "routes" USING GIST ("shape");
CREATE INDEX IF NOT EXISTS bus_locations_geom_idx ON "bus_locations" USING GIST ("geom");

-- Recent-history lookups are always "this bus, newest first".
CREATE INDEX IF NOT EXISTS bus_locations_bus_recorded_desc_idx
  ON "bus_locations" ("bus_id", "recorded_at" DESC);

-- ---------------------------------------------------- keep geom in sync ----
-- lat/lng are the wire format (what a GPS device reports and what JSON carries);
-- geom is what PostGIS queries. Deriving geom in a trigger means the two can
-- never disagree, no matter which code path performs the insert.

CREATE OR REPLACE FUNCTION himgati_sync_point_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."lat" IS NOT NULL AND NEW."lng" IS NOT NULL THEN
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stops_sync_geom ON "stops";
CREATE TRIGGER stops_sync_geom
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "stops"
  FOR EACH ROW EXECUTE FUNCTION himgati_sync_point_geom();

DROP TRIGGER IF EXISTS bus_locations_sync_geom ON "bus_locations";
CREATE TRIGGER bus_locations_sync_geom
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "bus_locations"
  FOR EACH ROW EXECUTE FUNCTION himgati_sync_point_geom();
