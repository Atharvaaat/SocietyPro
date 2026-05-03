// PM2 ecosystem config for SocietyPro backend on home server
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save          ← persist across reboots
//   pm2 startup       ← auto-start on system boot
//   pm2 logs          ← view logs
//   pm2 restart societypro-backend

module.exports = {
  apps: [{
    name:        'societypro-backend',
    script:      'src/app.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '200M',

    env: {
      NODE_ENV: 'development',
      PORT:     3001,
    },

    env_production: {
      NODE_ENV: 'production',
      PORT:     3001,
    },

    // Log config
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    out_file:  './logs/out.log',
    error_file:'./logs/error.log',
    merge_logs: true,
  }]
};
