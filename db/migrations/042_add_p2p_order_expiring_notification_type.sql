-- Add p2p_order_expiring notification type
-- Date: 2026-02-17

BEGIN;

ALTER TABLE ex_notification
  DROP CONSTRAINT IF EXISTS ex_notification_type_check;

ALTER TABLE ex_notification
  ADD CONSTRAINT ex_notification_type_check
  CHECK (
    type IN (
      'order_filled',
      'order_partially_filled',
      'order_canceled',
      'deposit_credited',
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed',
      'trade_won',
      'trade_lost',
      'p2p_order_created',
      'p2p_order_expiring',
      'p2p_payment_confirmed',
      'p2p_order_completed',
      'p2p_order_cancelled',
      'p2p_dispute_opened',
      'p2p_dispute_resolved',
      'p2p_feedback_received',
      'system'
    )
  );

COMMIT;
