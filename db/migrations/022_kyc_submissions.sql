-- KYC document submissions for identity verification
-- Users upload documents which go into pending_review → approved/rejected by admin

CREATE TABLE IF NOT EXISTS kyc_submission (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app_user(id),
  document_type    text NOT NULL CHECK (document_type IN ('passport', 'national_id', 'drivers_license')),
  -- We store a reference (base64 hash / object key), NOT the raw image
  document_front   text NOT NULL,   -- base64 encoded image or storage key
  document_back    text,            -- optional back side
  selfie           text,            -- optional selfie with document
  status           text NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review', 'approved', 'rejected', 'expired')),
  rejection_reason text,
  reviewed_by      text,
  reviewed_at      timestamptz,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_submission_user   ON kyc_submission (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submission_status ON kyc_submission (status);
