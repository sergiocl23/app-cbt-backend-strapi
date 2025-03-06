export default [
  'strapi::logger',
  'strapi::errors',
  //BORRAR DESPUES DE PROBAR
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://*', 'http://*'],
          'media-src': ["'self'", 'data:', 'blob:', 'https://*', 'http://*'],
        },
      },
    },
  },
  //BORRAR DESPUES DE PROBAR
  {
    name: 'strapi::cors',
    config: {
      enabled: true,
      headers: '*',
      origin: ['http://localhost:4200', 'http://localhost:1337']
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
