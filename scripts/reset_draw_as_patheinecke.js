require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');
(async function(){
  try {
    const secret = process.env.JWT_SECRET || 'change_this_secret';
    const token = jwt.sign({ id: 1, email: 'patheinecke@gmail.com' }, secret, { expiresIn: '7d' });
    console.log('Using token:', token.slice(0,20) + '...');

    const opts = {
      hostname: '127.0.0.1', port: process.env.PORT || 3078, path: '/api/draw-reset', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', async () => {
        console.log('Status:', res.statusCode);
        try { console.log('Body:', JSON.parse(body)); } catch (e) { console.log('Body:', body); }
        // show assignments count
        const mysql = require('mysql2/promise');
        let pool;
        if (process.env.DATABASE_URL) {
          const u = new URL(process.env.DATABASE_URL);
          pool = await mysql.createPool({ host: u.hostname, port: u.port?parseInt(u.port,10):3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname?u.pathname.replace(/^\//,''):undefined });
        } else {
          pool = await mysql.createPool({ host: process.env.DB_HOST||'localhost', user: process.env.DB_USER||'user', password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'secret_santa_db', port: process.env.DB_PORT?parseInt(process.env.DB_PORT,10):3306 });
        }
        const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM assignments');
        console.log('Assignments count:', rows && rows[0] && rows[0].cnt);
        await pool.end();
        process.exit(0);
      });
    });
    req.on('error', (err) => { console.error('Request error', err); process.exit(2); });
    req.write('{}');
    req.end();
  } catch (err) {
    console.error(err); process.exit(1);
  }
})();