
import postgres from "postgres";

const DATABASE_URL = "postgres://neondb_owner:npg_p0TuSbgYi3rv@ep-shiny-math-ahymkfdk-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const sql = postgres(DATABASE_URL, { ssl: "require" });

  try {
    console.log("--- LOCK DEBUG START ---");
    
    // 1. Check for blocking locks
    const locks = await sql`
      SELECT 
        blocked_locks.pid     AS blocked_pid,
        blocked_activity.usename  AS blocked_user,
        blocked_activity.query    AS blocked_query,
        blocking_locks.pid     AS blocking_pid,
        blocking_activity.usename AS blocking_user,
        blocking_activity.query   AS blocking_query
      FROM  pg_catalog.pg_locks         blocked_locks
      JOIN pg_catalog.pg_stat_activity blocked_activity  ON blocked_activity.pid = blocked_locks.pid
      JOIN pg_catalog.pg_locks         blocking_locks 
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
        AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
        AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
        AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
        AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
        AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
        AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
        AND blocking_locks.pid != blocked_locks.pid
      JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
      WHERE NOT blocked_locks.granted;
    `;

    if (locks.length > 0) {
      console.log("!!! FOUND BLOCKING LOCKS !!!");
      console.table(locks);
      
      // Attempt to terminate blocking PIDs?
      // Uncomment to kill:
      /*
      for (const lock of locks) {
        console.log(`Killing blocking PID: ${lock.blocking_pid}`);
        await sql`SELECT pg_terminate_backend(${lock.blocking_pid})`;
      }
      */
    } else {
      console.log("No blocking locks found.");
    }

    // 2. Check all active transactions longer than 5 seconds
    const longRunning = await sql`
        SELECT pid, state, query, age(clock_timestamp(), query_start) as duration
        FROM pg_stat_activity
        WHERE state != 'idle' 
        AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY duration DESC
        LIMIT 5;
    `;
    console.log("\n--- Active Queries ---");
    console.table(longRunning);

  } catch (err) {
    console.error("Lock Debug Error:", err);
  } finally {
    await sql.end();
  }
}

main();
