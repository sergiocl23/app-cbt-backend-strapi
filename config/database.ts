export default ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'mysql'),
    connection: {
      host: env('DATABASE_HOST', 'localhost'),
      port: env.int('DATABASE_PORT', 3306),
      database: env('DATABASE_NAME', 'strapi'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'strapi'),
      ssl: env.bool('DATABASE_SSL', false),
      charset: 'utf8mb4',
      timezone: '+00:00',
      connectTimeout: 60000,
    },
    pool: {
      min: 0,
      max: 10,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 60000,
      idleTimeoutMillis: 60000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
    },
    debug: false,
    acquireConnectionTimeout: 60000,
    //debug: env('NODE_ENV') === 'development', para desarrollo
  },
});
