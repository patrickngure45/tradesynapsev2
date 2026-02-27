require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const postgres = require('postgres');

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 60, idle_timeout: 20 });
  const assetsEnabled = (await sql.unsafe("select count(*)::int as c from ex_asset where is_enabled=true"))[0].c;
  const marketsEnabled = (await sql.unsafe("select count(*)::int as c from ex_market where status='enabled'"))[0].c;
  console.log(JSON.stringify({ assets_enabled: assetsEnabled, markets_enabled: marketsEnabled }));
  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
