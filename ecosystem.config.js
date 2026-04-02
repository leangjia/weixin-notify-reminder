module.exports = {
  apps: [{
    name: 'rohs-monitor',
    script: 'app.js',
    cwd: '.',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      TZ: 'Asia/Shanghai'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      TZ: 'Asia/Shanghai'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
