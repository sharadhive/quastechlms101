-- Used once on an EXISTING database that was built with the old migrations / `prisma db push`.
-- Clears Prisma's migration history so the new baseline can be marked as already applied.
-- It does NOT touch any of your data tables.
DELETE FROM `_prisma_migrations`;
