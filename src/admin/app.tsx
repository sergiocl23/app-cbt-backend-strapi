import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: ['es'],
    translations: {
      es: {
        "app.components.LeftMenu.navbrand.title": "Panel de Control",
      },
    },
  },
  bootstrap(app: StrapiApp) {},
}; 