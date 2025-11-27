require('dotenv').config();
const mysql = require('mysql2/promise');
(async function(){
  try {
    let pool;
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL);
      const cfg = { host: u.hostname, port: u.port?parseInt(u.port,10):3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname?u.pathname.replace(/^\//,''):undefined };
      pool = await mysql.createPool(Object.assign({ waitForConnections:true, connectionLimit:10 }, cfg));
      console.log('Using DATABASE_URL:', process.env.DATABASE_URL);
    } else {
      pool = await mysql.createPool({ host: process.env.DB_HOST||'localhost', user: process.env.DB_USER||'user', password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'secret_santa_db', port: process.env.DB_PORT?parseInt(process.env.DB_PORT,10):3306, waitForConnections:true, connectionLimit:10 });
      console.log('Using DB_* env:', process.env.DB_USER+'@'+process.env.DB_HOST+':'+(process.env.DB_PORT||'3306')+'/'+process.env.DB_NAME);
    }
    const [result] = await pool.query('DELETE FROM assignments');
    console.log('DELETE result:', result);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Clear assignments error:');
    console.error(err);
    process.exit(1);
  }
})();