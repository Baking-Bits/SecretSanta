require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 3078;

function doRequest(method, pathname, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: HOST,
      port: PORT,
      path: pathname,
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async function(){
  try {
    const email = 'dev.runner+' + Date.now() + '@example.com';
    const password = 'password1234';
    console.log('Attempting register with', email);
    let r = await doRequest('POST', '/api/register', { email, password });
    if (r.status === 200 && r.body && r.body.token) {
      console.log('Registered and got token');
    } else if (r.status === 400 && r.body && r.body.error && String(r.body.error).toLowerCase().includes('email')) {
      console.log('Register reported email exists, attempting login');
      r = await doRequest('POST', '/api/login', { email, password });
    } else if (r.status !== 200) {
      console.log('Register returned:', r.status, r.body || r.raw);
      // try login anyway
      r = await doRequest('POST', '/api/login', { email, password });
    }
    if (!r || !r.body || !r.body.token) {
      console.error('Could not obtain token via register/login. Response:', r);
      process.exit(1);
    }
    const token = r.body.token;
    console.log('Obtained token, running POST /api/draw');
    const drawRes = await doRequest('POST', '/api/draw', {}, { Authorization: 'Bearer ' + token });
    console.log('Draw response status:', drawRes.status);
    console.log('Draw response body:', drawRes.body);

    // Read last lines of logs/activity.log
    const logPath = path.join(__dirname, '..', 'logs', 'activity.log');
    try {
      const logData = fs.readFileSync(logPath, 'utf8');
      const lines = logData.trim().split(/\r?\n/).slice(-20);
      console.log('Last activity.log lines:');
      for (const L of lines) console.log(L);
    } catch (le) {
      console.log('Could not read activity.log:', String(le.message || le));
    }

    // Also fetch draw-status
    const status = await doRequest('GET', '/api/draw-status', null, { Authorization: 'Bearer ' + token });
    console.log('Draw-status:', status.status, status.body);

    process.exit(0);
  } catch (err) {
    console.error('E2E test error:', err);
    process.exit(2);
  }
})();