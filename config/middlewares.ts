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
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
