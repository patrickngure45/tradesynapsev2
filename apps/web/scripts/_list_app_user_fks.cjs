require('dotenv').config();
const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', connect_timeout: 30, max: 1 });
  const rows = await sql.unsafe(
    "select conname, conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as def from pg_constraint where contype='f' and confrelid='app_user'::regclass order by table_name, conname"
  );
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
