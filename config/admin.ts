export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    options: {
      expiresIn: '30d',
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  flags: {
    nps: false,
    promoBanner: false,
  },
  watchIgnoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/.DS_Store',
  ],
  auditLogs: {
    enabled: true,
    retentionDays: 30,
  },
});
