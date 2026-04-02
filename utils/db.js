const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DB_PATH || './data/rohs.db';

const db = new Database(dbPath);

db.exec(`
  -- 用户表
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 供应商配置表
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    email TEXT,
    cc TEXT,
    mobile TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 环保报告主表
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_model TEXT NOT NULL,
    material_category TEXT,
    vendor TEXT,
    report_type TEXT,
    test_org TEXT,
    report_no TEXT,
    report_date DATE,
    expiry_date DATE,
    valid_days INTEGER,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Wafer报告表
  CREATE TABLE IF NOT EXISTS wafer_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_model TEXT NOT NULL,
    material_category TEXT,
    vendor TEXT,
    report_type TEXT,
    report_no TEXT,
    report_date DATE,
    expiry_date DATE,
    valid_days INTEGER,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 任务配置表
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT,
    cron TEXT NOT NULL DEFAULT '0 9 * * *',
    mobile_numbers TEXT,
    active_days TEXT DEFAULT '[1,2,3,4,5]',
    notify_type TEXT DEFAULT 'wechat,email',
    remind_type TEXT DEFAULT '报告',
    enabled INTEGER DEFAULT 1,
    last_run DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 导入历史记录表
  CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    records_count INTEGER,
    status TEXT,
    error_message TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 发送记录表
  CREATE TABLE IF NOT EXISTS send_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    vendor TEXT,
    material_model TEXT,
    message_type TEXT,
    notify_type TEXT,
    status TEXT,
    error_message TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 体系证书表
  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_name TEXT NOT NULL,
    certificate_name TEXT,
    certification_scope TEXT,
    certification_authority TEXT,
    certificate_no TEXT,
    iatf_certificate_no TEXT,
    organization_address TEXT,
    certificate_date DATE,
    expiry_date DATE,
    valid_days INTEGER,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN remind_type TEXT DEFAULT '报告'`);
} catch (e) {
  // 忽略列已存在的错误
}

console.log('Database initialized successfully');
module.exports = db;
