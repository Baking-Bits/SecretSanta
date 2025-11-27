const { spawn, exec } = require('child_process');
const path = require('path');

function run(command, args, opts = {}) {
  const p = spawn(command, args, Object.assign({ stdio: 'inherit', shell: true }, opts));
  p.on('error', (e) => console.error(`Failed to start ${command}:`, e));
  return p;
}

function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

async function killPort(port) {
  if (!port) return;
  try {
    if (process.platform === 'win32') {
      // list network connections and find pid(s)
      const cmd = `netstat -ano | findstr :${port}`;
      const { stdout } = await execCmd(cmd).catch(() => ({ stdout: '' }));
      if (!stdout) return;
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== String(process.pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          console.log(`Killing PID ${pid} on port ${port}`);
          await execCmd(`taskkill /F /PID ${pid}`);
        } catch (e) {
          // ignore
        }
      }
    } else {
      // unix-like: use lsof
      const { stdout } = await execCmd(`lsof -i :${port} -t`).catch(() => ({ stdout: '' }));
      if (!stdout) return;
      const pids = stdout.trim().split(/\r?\n/).filter(Boolean);
      for (const pid of pids) {
        try {
          console.log(`Killing PID ${pid} on port ${port}`);
          await execCmd(`kill -9 ${pid}`);
        } catch (e) {}
      }
    }
  } catch (e) {
    // best-effort: ignore errors
  }
}

async function main() {
  try {
    // determine ports
    const backendPort = process.env.PORT || 3000;
    const clientPort = process.env.CLIENT_PORT || process.env.VITE_PORT || 5173;

    console.log(`Checking ports: backend ${backendPort}, client ${clientPort}`);

    // try to kill any process currently listening on those ports
    await killPort(backendPort);
    await killPort(clientPort);

    console.log('Running DB init (if needed)');
    // run init-db synchronously and wait
    await new Promise((resolve, reject) => {
      const p = run('node', ['scripts/init_db.js']);
      p.on('exit', (code) => {
        if (code === 0) resolve(); else {
          console.warn('DB init exited with code', code, '- continuing (DB may already exist)');
          resolve();
        }
      });
    });

    console.log('Starting backend server (node server.js)');
    const server = run('node', ['server.js']);

    console.log('Starting client dev server (npm run dev in client/)');
    const client = run('npm', ['run', 'dev'], { cwd: path.join(__dirname, '..', 'client') });

    function shutdown() {
      console.log('\nShutting down dev processes...');
      try { server.kill(); } catch (e) {}
      try { client.kill(); } catch (e) {}
      process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Dev start failed:', err);
    process.exit(1);
  }
}

main();
