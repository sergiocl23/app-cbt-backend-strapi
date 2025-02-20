/**
 * noticia router
 */

import { factories } from '@strapi/strapi';

export default {
  routes: [
    {
      method: 'POST',
      path: '/noticias/scrape',
      handler: 'noticia.scrapeNews',
      config: {
        policies: [],
        auth: false,
      }
    },
    {
      method: 'GET',
      path: '/noticias',
      handler: 'noticia.find',
      config: {
        auth: false,
        policies: [],
        query: {
          tags: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          pais: { 
            type: 'string',
            enum: ['chile', 'paraguay', 'brasil', 'argentina', 'mundo']
          }
        }
      }
    },
     //VISTA DE LA BASE DE DATOS BORRAR DESPUES DE PROBAR
    {
      method: 'GET',
      path: '/noticias/view',
      handler: 'noticia.viewNoticias',
      config: {
        auth: false,
      }
    }, // DEBUG ROUTE - Ruta temporal para depuración (BORRAR EN PRODUCCIÓN)
    {
      method: 'GET',
      path: '/noticias/search-debug',
      handler: 'noticia.searchDebug',
    },
    {
      method: 'GET',
      path: '/noticias/test-scraper',
      handler: 'noticia.testScraper',
      config: {
        auth: false,
      }
    }
  ]
};
