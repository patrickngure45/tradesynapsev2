
import "dotenv/config";
import { createSql } from "../src/lib/db";

async function main() {
  const sql = createSql();
  console.log("🔍 Inspecting P2P Ads...");

  const ads = await sql`
    SELECT id, side, fixed_price, remaining_amount, status, created_at, asset_id
    FROM p2p_ad
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log("Ads found:", ads);
  
  if (ads.length > 0) {
      const assets = await sql`SELECT id, symbol FROM ex_asset WHERE id = ${ads[0].asset_id}`;
      console.log("Asset details for first ad:", assets);
  }

  await sql.end();
}

main().catch(console.error);
