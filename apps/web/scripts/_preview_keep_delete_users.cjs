require('dotenv').config();
const postgres = require('postgres');

const KEEP = [
  'ngurengure10@gmail.com',
  'sallymellow03@gmail.com',
  'macharialouis4@gmail.com',
  'anthalamuziq@gmail.com',
].map((s) => s.toLowerCase());

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', connect_timeout: 30, max: 1 });
  const rows = await sql.unsafe(
    "select id::text as id, email, status, role from app_user where email is not null order by email"
  );
  const keepRows = rows.filter((r) => KEEP.includes(String(r.email).toLowerCase()));
  const delRows = rows.filter((r) => !KEEP.includes(String(r.email).toLowerCase()));
  console.log(JSON.stringify({ keep: keepRows, delete: delRows }, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
