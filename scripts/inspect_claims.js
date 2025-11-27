require('dotenv').config();
const mysql = require('mysql2/promise');
(async function(){
  try {
    let pool;
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL);
      const cfg = { host: u.hostname, port: u.port?parseInt(u.port,10):3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname?u.pathname.replace(/^\//,''):undefined };
      pool = await mysql.createPool(Object.assign({ waitForConnections:true, connectionLimit:10 }, cfg));
    } else {
      pool = await mysql.createPool({ host: process.env.DB_HOST||'localhost', user: process.env.DB_USER||'user', password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'secret_santa_db', port: process.env.DB_PORT?parseInt(process.env.DB_PORT,10):3306, waitForConnections:true, connectionLimit:10 });
    }

    console.log('Profiles:');
    const [profiles] = await pool.query('SELECT p.id, p.name, p.partner_profile_id, c.user_id AS claimed_by FROM profiles p LEFT JOIN claims c ON p.id = c.profile_id ORDER BY p.id');
    console.table(profiles);

    console.log('\nClaims (raw):');
    const [claims] = await pool.query('SELECT * FROM claims');
    console.table(claims);

    console.log('\nUsers:');
    const [users] = await pool.query('SELECT id, email FROM users');
    console.table(users);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Inspect error:', err);
    process.exit(1);
  }
})();