const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
console.log('[delete-nonkept-users] start', { hasDatabaseUrl: Boolean(process.env.DATABASE_URL) });
const postgres = require('postgres');

const KEEP_EMAILS = [
  'ngurengure10@gmail.com',
  'sallymellow03@gmail.com',
  'macharialouis4@gmail.com',
  'anthalamuziq@gmail.com',
].map((s) => s.toLowerCase());

const SYSTEM_USER_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
];

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientDbError(e) {
  const code = e && (e.code || e.errno);
  const msg = String(e && (e.message || e));
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'CONNECT_TIMEOUT' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('CONNECT_TIMEOUT')
  );
}

async function withRetry(label, fn, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientDbError(e) || i === attempts) throw e;
      console.log(`[delete-nonkept-users] transient error during ${label}; retry ${i}/${attempts}`);
      await sleep(500 * i);
    }
  }
  throw lastErr;
}

async function main() {
  console.log('[delete-nonkept-users] connecting...');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', connect_timeout: 60, max: 1, idle_timeout: 20 });

  console.log('[delete-nonkept-users] fetching users...');
  const users = await withRetry('fetch_users', async () => {
    return await sql.unsafe(
      "select id::text as id, email, status, role from app_user where email is not null order by lower(email)"
    );
  });

  console.log('[delete-nonkept-users] fetched', users.length);

  const keep = users.filter((u) => KEEP_EMAILS.includes(String(u.email).toLowerCase()));
  const toDelete = users.filter((u) => !KEEP_EMAILS.includes(String(u.email).toLowerCase()));

  const missing = KEEP_EMAILS.filter(
    (e) => !keep.some((u) => String(u.email).toLowerCase() === e)
  );
  if (missing.length) {
    console.error('[delete-nonkept-users] Missing keep emails in DB:', missing);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const keepUsersPreview = keep.map((u) => ({ id: u.id, email: u.email, status: u.status, role: u.role }));
  const deleteEmails = toDelete.map((u) => String(u.email).toLowerCase());
  const deleteEmailsSample = deleteEmails.slice(0, 50);

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        keepEmails: KEEP_EMAILS,
        keepUsers: keepUsersPreview,
        counts: {
          keep: keep.length,
          delete: toDelete.length,
          totalEmailUsers: users.length,
          deleteEmailsSampleSize: deleteEmailsSample.length,
        },
        deleteEmailsSample,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with APPLY=1 to delete the non-kept users.');
    await sql.end();
    return;
  }

  const deleteIds = toDelete.map((u) => u.id);

  await withRetry('delete_txn', async () => {
    await sql.begin(async (tx) => {
    if (deleteIds.length) {
      await tx`DELETE FROM p2p_payment_method WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM kyc_submission WHERE user_id::text = ANY(${deleteIds})`;

      await tx`DELETE FROM ex_order WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM ex_withdrawal_request WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM ex_deposit_address WHERE user_id::text = ANY(${deleteIds})`;

      await tx`DELETE FROM ex_ledger_account WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM ex_chain_tx WHERE user_id::text = ANY(${deleteIds})`;

      await tx`DELETE FROM app_user WHERE id::text = ANY(${deleteIds})`;
    }

    await tx`UPDATE app_user SET status='active' WHERE lower(email) = ANY(${KEEP_EMAILS})`;
    await tx`UPDATE app_user SET status='active' WHERE id::text = ANY(${SYSTEM_USER_IDS})`;
    });
    });

  console.log('\n[delete-nonkept-users] Applied.');
  await sql.end();
}

main().catch((e) => {
  console.error('[delete-nonkept-users] Failed:', e);
  process.exit(1);
});
