const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

function parseDatabaseUrl(urlString) {
  try {
    const u = new URL(urlString);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname ? u.pathname.replace(/^\//, '') : undefined
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const cfg = process.env.DATABASE_URL ? parseDatabaseUrl(process.env.DATABASE_URL) : {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'secret_santa_db'
  };

  if (!cfg) {
    console.error('No DB configuration available. Set DATABASE_URL or DB_* env vars.');
    process.exit(1);
  }

  const { database } = cfg;
  const adminCfg = Object.assign({}, cfg);
  // remove database for admin connection
  delete adminCfg.database;
  adminCfg.multipleStatements = true;

  console.log('Connecting to MariaDB server at', adminCfg.host + ':' + adminCfg.port);
  let created = false;
  try {
    const conn = await mysql.createConnection(adminCfg);
    try {
      console.log('Creating database if not exists:', database);
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      created = true;
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.warn('Could not create database (this may be because the DB user lacks CREATE DATABASE privilege).');
    console.warn('Error:', err.message);
    // continue and attempt to apply schema directly to the target database
  }

  // connect to the new database and run schema
  const dbCfg = Object.assign({}, cfg, { multipleStatements: true });
  // Attempt to apply schema to the target database. This will succeed if the DB exists and the user has table creation rights.
  try {
    const dbConn = await mysql.createConnection(dbCfg);
    try {
      const sql = fs.readFileSync(require('path').join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
      console.log('Applying schema.sql (this may output warnings)');
      await dbConn.query(sql);
      console.log('Schema applied successfully.');
      return;
    } finally {
      await dbConn.end();
    }
  } catch (err) {
    console.error('Failed to apply schema to database:', database);
    console.error('Error:', err.message);
    if (!created) {
      console.error('The DB user likely lacks privileges to create the database. Please create the database and/or grant the user the necessary privileges, or run this script with an admin user.');
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error initializing DB:', err);
  process.exit(1);
});
