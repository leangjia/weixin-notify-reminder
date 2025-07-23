// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'reminder',
    script: './reminder.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true
  }]
};
