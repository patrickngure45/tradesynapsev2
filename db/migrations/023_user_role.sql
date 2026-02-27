-- 023: Add role column to app_user for admin authorization
-- Replaces static EXCHANGE_ADMIN_KEY with session-based admin role check

ALTER TABLE app_user
  ADD COLUMN role text NOT NULL DEFAULT 'user';

ALTER TABLE app_user
  ADD CONSTRAINT app_user_role_check CHECK (role IN ('user', 'admin'));

-- Index for quick admin lookups
CREATE INDEX idx_app_user_role ON app_user (role) WHERE role = 'admin';

COMMENT ON COLUMN app_user.role IS 'Authorization role: user (default) or admin. Admin role grants access to admin API endpoints.';
