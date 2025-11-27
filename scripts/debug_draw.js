const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'secret_santa_db',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    waitForConnections: true,
    connectionLimit: 5
  });

  const rows = await pool.query('SELECT p.id AS profile_id, p.name, p.partner_profile_id, c.user_id AS claimed_user_id FROM profiles p LEFT JOIN claims c ON p.id = c.profile_id ORDER BY p.id');
  const givers = rows[0];
  const recipientProfiles = givers.map(r => r.profile_id);
  const ids = recipientProfiles.slice();
  const idToIndex = {};
  ids.forEach((id, idx) => { idToIndex[id] = idx; });
  const n = ids.length;
  const adj = Array.from({ length: givers.length }, () => []);
  for (let i = 0; i < givers.length; i++) {
    const g = givers[i];
    for (const cand of recipientProfiles) {
      if (cand === g.profile_id) continue;
      if (g.partner_profile_id && cand === g.partner_profile_id) continue;
      const v = idToIndex[cand];
      if (typeof v !== 'undefined') adj[i].push(v);
    }
  }

  function hopcroftKarp() {
    const INF = 1e9;
    const pairU = Array(givers.length).fill(-1);
    const pairV = Array(ids.length).fill(-1);
    const dist = Array(givers.length).fill(0);
    function bfs() {
      const queue = [];
      for (let u = 0; u < givers.length; u++) {
        if (pairU[u] === -1) { dist[u] = 0; queue.push(u); }
        else dist[u] = INF;
      }
      let found = false;
      while (queue.length) {
        const u = queue.shift();
        for (const v of adj[u]) {
          const pu = pairV[v];
          if (pu !== -1 && dist[pu] === INF) {
            dist[pu] = dist[u] + 1;
            queue.push(pu);
          }
          if (pu === -1) found = true;
        }
      }
      return found;
    }
    function dfs(u) {
      for (const v of adj[u]) {
        const pu = pairV[v];
        if (pu === -1 || (dist[pu] === dist[u] + 1 && dfs(pu))) {
          pairU[u] = v; pairV[v] = u; return true;
        }
      }
      dist[u] = INF;
      return false;
    }
    let result = 0;
    while (bfs()) {
      for (let u = 0; u < givers.length; u++) if (pairU[u] === -1) if (dfs(u)) result++;
    }
    return { pairU, result, pairV };
  }

  const { pairU, result } = hopcroftKarp();
  console.log('participants', givers.length);
  console.log('match size', result);
  if (result < givers.length) {
    console.log('Matching failed. Per-giver options:');
    givers.forEach((g, idx) => {
      console.log(g.profile_id, g.name, '->', adj[idx].map(v => ids[v]));
    });
  } else {
    console.log('Matching succeeded. Example assignment (profile -> profile):');
    givers.forEach((g, idx) => {
      const recip = ids[pairU[idx]];
      console.log(`${g.profile_id} (${g.name}) -> ${recip}`);
    });

    if (process.argv.includes('--apply')) {
      console.log('Persisting assignments to database...');
      await pool.query('DELETE FROM assignments');
      for (let u = 0; u < givers.length; u++) {
        const recipIdx = pairU[u];
        const giverProfileId = givers[u].profile_id;
        const recipientProfileId = ids[recipIdx];
        const claimedUserId = givers[u].claimed_user_id;
        if (claimedUserId) {
          await pool.query('INSERT INTO assignments (giver_user_id, giver_profile_id, recipient_profile_id) VALUES (?, NULL, ?)', [claimedUserId, recipientProfileId]);
        } else {
          await pool.query('INSERT INTO assignments (giver_user_id, giver_profile_id, recipient_profile_id) VALUES (NULL, ?, ?)', [giverProfileId, recipientProfileId]);
        }
      }
      const [rows] = await pool.query('SELECT id, giver_user_id, giver_profile_id, recipient_profile_id FROM assignments ORDER BY id');
      console.log('Assignments saved:', rows);
    }
  }

  await pool.end();
})();
