import type postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export type ChainTxReceipt = {
  txHash: string;
  blockHeight: number;
  blockId: string;
};

export async function recordInternalChainTx(
  sql: Sql,
  args: {
    entryId: string;
    type: string;
    userId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<ChainTxReceipt> {
  const meta = args.metadata ?? {};

  const blockRows = await sql<{ id: string; height: number }[]>`
    INSERT INTO ex_chain_block DEFAULT VALUES
    RETURNING id::text AS id, height
  `;
  const block = blockRows[0]!;

  const uid = args.userId && args.userId.trim().length ? args.userId.trim() : null;

  // gen_random_bytes is provided by pgcrypto (already used in this project via gen_random_uuid).
  const txRows = await sql<{ tx_hash: string }[]>`
    INSERT INTO ex_chain_tx (tx_hash, entry_id, type, user_id, block_id, metadata_json)
    VALUES (
      encode(gen_random_bytes(32), 'hex'),
      ${args.entryId}::uuid,
      ${args.type},
      CASE WHEN ${uid}::text IS NULL THEN NULL ELSE ${uid}::uuid END,
      ${block.id}::uuid,
      ${(sql as any).json(meta as any)}::jsonb
    )
    RETURNING tx_hash
  `;

  return {
    txHash: txRows[0]!.tx_hash,
    blockHeight: block.height,
    blockId: block.id,
  };
}
