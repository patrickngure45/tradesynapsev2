-- Simulated internal chain: blocks + transactions.
-- Purpose: provide tx hashes + block heights for ledger-backed actions,
-- without implementing a real consensus network.

CREATE TABLE IF NOT EXISTS ex_chain_block (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  height bigserial UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ex_chain_tx (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash text UNIQUE NOT NULL,
  entry_id uuid NOT NULL REFERENCES ex_journal_entry(id) ON DELETE CASCADE,
  type text NOT NULL,
  user_id uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  block_id uuid NULL REFERENCES ex_chain_block(id) ON DELETE SET NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ex_chain_tx_entry_id ON ex_chain_tx(entry_id);
CREATE INDEX IF NOT EXISTS idx_ex_chain_tx_user_id ON ex_chain_tx(user_id);
CREATE INDEX IF NOT EXISTS idx_ex_chain_tx_block_id ON ex_chain_tx(block_id);
