-- TST Utility: Fee Discount Preference
ALTER TABLE app_user
ADD COLUMN pay_fees_with_tst BOOLEAN DEFAULT FALSE;

-- Index for quickly finding users who need fee calculation logic applied
CREATE INDEX idx_users_pay_fees_with_tst ON app_user(pay_fees_with_tst) WHERE pay_fees_with_tst = TRUE;
