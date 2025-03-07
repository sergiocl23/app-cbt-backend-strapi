import cronTasks from "./cron-tasks";

export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'http://localhost:1337'),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: cronTasks,
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
  // Configuración del sistema de newsletter
  newsletter: {
    defaultLogo: env('NEWSLETTER_DEFAULT_LOGO', '/uploads/logo.png'),
    dailyLimit: env.int('NEWSLETTER_DAILY_LIMIT', 1000),
    hourlyLimit: env.int('NEWSLETTER_HOURLY_LIMIT', 150),
    batchSize: env.int('NEWSLETTER_BATCH_SIZE', 50),
    delayBetweenBatches: env.int('NEWSLETTER_DELAY_BETWEEN_BATCHES', 3000)
  },
  // Ajuste para mejorar la estabilidad del servidor
  http: {
    serverOptions: {
      keepAliveTimeout: 60000, // milliseconds
    }
  }
});
