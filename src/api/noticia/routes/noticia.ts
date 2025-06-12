/**
 * noticia router
 */

import { factories } from '@strapi/strapi';

export default {
  routes: [
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

    // Ruta para generar resumen usando IA
    {
      method: 'POST',
      path: '/noticias/generar-resumen',
      handler: 'noticia.generarResumen',
      config: {
        auth: false,
      }
    },
  
    // RUTA: Ver una noticia individual por su ID (soporta múltiples formatos)
    {
      method: 'GET',
      path: '/noticias/ver/:id',
      handler: 'noticia.verNoticia',
      config: {
        auth: false,
      }
    },
    {
      method: 'GET',
      path: '/noticias/combined-search',
      handler: 'noticia.findNewsCombined',
      config: {
        auth: false,
      }
    }
  ]
};
