-- Migration: Fix activity_logs column
-- Adds duration_minutes column if it doesn't exist

DO $$
BEGIN
    -- Add duration_minutes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_logs' AND column_name = 'duration_minutes'
    ) THEN
        ALTER TABLE activity_logs ADD COLUMN duration_minutes DECIMAL(10,2);
    END IF;
    
    -- If duration_seconds exists, migrate data to duration_minutes and drop old column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_logs' AND column_name = 'duration_seconds'
    ) THEN
        -- Migrate data (convert seconds to minutes)
        UPDATE activity_logs SET duration_minutes = duration_seconds / 60.0 WHERE duration_minutes IS NULL AND duration_seconds IS NOT NULL;
        -- Drop old column
        ALTER TABLE activity_logs DROP COLUMN duration_seconds;
    END IF;
END $$;
