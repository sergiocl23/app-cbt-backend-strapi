export default [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:', 'http:'],
          'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'https://*', 'http://*'],
          'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'https://*', 'http://*'],
          upgradeInsecureRequests: null,
        },
      },
      frameguard: {
        action: 'sameorigin',
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      enabled: true,
      headers: '*',
      origin: ['*'] // Permitir todos los orígenes en desarrollo
    }
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      jsonLimit: '20mb',
      formLimit: '20mb',
      textLimit: '20mb',
      formidable: {
        maxFileSize: 20 * 1024 * 1024, // 20 MB en bytes
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
