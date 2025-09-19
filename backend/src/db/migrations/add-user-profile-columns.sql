-- Add missing user profile columns
-- Migration to add first_name, last_name, phone, and email_verified columns

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
