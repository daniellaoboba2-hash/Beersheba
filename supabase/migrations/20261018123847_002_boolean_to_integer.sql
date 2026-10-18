/*
# Convert boolean columns to integer for SQLite compatibility

The existing Beersheba application code uses SQLite's integer-as-boolean
convention (0/1) throughout — e.g. `body.vipEligible ? 1 : 0` and
`!!book.vip_eligible`. Postgres boolean columns do not accept integer
literals directly, so this migration converts all boolean columns back
to integer NOT NULL DEFAULT 0/1 to preserve the existing code behavior.

No data exists yet (fresh schema), so this is safe.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'boolean'
  LOOP
    -- Drop the default first so the type cast doesn't have to cast the default
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.table_name, r.column_name);
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE integer USING (%I::int)',
      r.table_name, r.column_name, r.column_name
    );
    IF r.column_default IS NOT NULL AND r.column_default::text LIKE '%true%' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT 1', r.table_name, r.column_name);
    ELSE
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT 0', r.table_name, r.column_name);
    END IF;
  END LOOP;
END $$;
