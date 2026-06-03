-- Migration: Add education column to scraped_profiles
-- The enrichment phase now extracts education history from LinkedIn profiles
ALTER TABLE scraped_profiles
ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb;

-- Also ensure experience column exists (may have been added previously)
ALTER TABLE scraped_profiles
ADD COLUMN IF NOT EXISTS experience JSONB DEFAULT '[]'::jsonb;
