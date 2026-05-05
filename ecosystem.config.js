module.exports = {
  apps: [
    {
      name: 'saci-bridge',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'info',
      },
      error_file: '/var/log/pm2/saci-bridge-error.log',
      out_file: '/var/log/pm2/saci-bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
