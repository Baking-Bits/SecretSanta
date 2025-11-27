const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || undefined,
  connectTimeout: 5000
};

async function main(){
  console.log('Testing DB connection with:');
  console.log(`  host=${cfg.host} port=${cfg.port} user=${cfg.user} database=${cfg.database}`);
  try{
    const conn = await mysql.createConnection(cfg);
    try{
      const [ver] = await conn.query('SELECT VERSION() AS v');
      let userVal = null;
      let currentUserVal = null;
      try {
        const [u] = await conn.query('SELECT USER() AS user');
        userVal = u && u[0] ? u[0].user : null;
      } catch (e) {
        console.warn('Could not run USER() query:', e.message);
      }
      try {
        const [cu] = await conn.query('SELECT CURRENT_USER() AS current_user');
        currentUserVal = cu && cu[0] ? cu[0].current_user : null;
      } catch (e) {
        console.warn('Could not run CURRENT_USER() query:', e.message);
      }
      console.log('Connected to MariaDB. Server version:', ver[0].v);
      console.log('USER():', userVal, 'CURRENT_USER():', currentUserVal);
      try{
        // Try to show grants for the current user; many MariaDB versions accept CURRENT_USER(),
        // but wrap in try/catch since some don't allow this form via this client.
        const [gr] = await conn.query('SHOW GRANTS FOR CURRENT_USER()');
        console.log('SHOW GRANTS FOR CURRENT_USER():');
        for(const r of gr) console.log('  ', Object.values(r).join(' '));
      }catch(e){
        console.warn('Could not run SHOW GRANTS FOR CURRENT_USER():', e.message);
      }
      await conn.end();
      process.exit(0);
    }catch(e){
      console.error('Error during queries after connect:', e.message);
      await conn.end();
      process.exit(2);
    }
  }catch(err){
    console.error('Connection failed:');
    try{
      const util = require('util');
      console.error(util.inspect(err, { depth: null, colors: false }));
    }catch(e){
      console.error(err && err.message ? err.message : err);
    }
    if(err && err.sqlMessage) console.error('SQL message:', err.sqlMessage);
    if(err && err.code) console.error('Error code:', err.code);
    if(err && err.errno) console.error('Errno:', err.errno);
    if(err && err.sqlState) console.error('SQL State:', err.sqlState);
    if(err && err.stack) console.error('Stack:', err.stack.split('\n').slice(0,5).join('\n'));
    process.exit(1);
  }
}

main();
