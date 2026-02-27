-- Fee Discount Preference (deprecated)
ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS pay_fees_with_tst BOOLEAN DEFAULT FALSE;

-- Index for quickly finding users who need fee calculation logic applied
CREATE INDEX IF NOT EXISTS idx_users_pay_fees_with_tst ON app_user(pay_fees_with_tst) WHERE pay_fees_with_tst = TRUE;
