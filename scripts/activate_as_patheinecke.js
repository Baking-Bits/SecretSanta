require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');
(async function(){
  try {
    const secret = process.env.JWT_SECRET || 'change_this_secret';
    const token = jwt.sign({ id: 1, email: 'patheinecke@gmail.com' }, secret, { expiresIn: '7d' });
    console.log('Using token:', token.slice(0,20) + '...');

    const opts = {
      hostname: '127.0.0.1', port: process.env.PORT || 3078, path: '/api/draw', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', async () => {
        console.log('Status:', res.statusCode);
        try { console.log('Body:', JSON.parse(body)); } catch (e) { console.log('Body:', body); }
        // show last activity.log lines
        const fs = require('fs');
        const path = require('path');
        try {
          const log = fs.readFileSync(path.join(__dirname, '..', 'logs', 'activity.log'), 'utf8').trim().split(/\r?\n/).slice(-20);
          console.log('Last activity.log lines:');
          console.log(log.join('\n'));
        } catch (le) { console.log('Could not read activity.log', String(le)); }
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