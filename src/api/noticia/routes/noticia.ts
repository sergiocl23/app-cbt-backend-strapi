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
    // NUEVA RUTA: Formulario para crear noticias manualmente
    {
      method: 'GET',
      path: '/noticias/crear',
      handler: 'noticia.crearNoticiaForm',
      config: {
        auth: false,
      }
    },
    // NUEVA RUTA: Endpoint para procesar el formulario
    {
      method: 'POST',
      path: '/noticias/crear',
      handler: 'noticia.crearNoticia',
      config: {
        auth: false,
      }
    },
    // NUEVA RUTA: Ver lista de noticias creadas manualmente
    {
      method: 'GET',
      path: '/noticias/listar',
      handler: 'noticia.listarNoticiasManual',
      config: {
        auth: false,
      }
    },
    // Ruta para publicar una noticia desde la vista
    {
      method: 'GET',
      path: '/noticias/publicar/:id',
      handler: 'noticia.publicarNoticia',
      config: {
        auth: false,
      }
    },
    // Ruta para despublicar una noticia desde la vista
    {
      method: 'GET',
      path: '/noticias/despublicar/:id',
      handler: 'noticia.despublicarNoticia',
      config: {
        auth: false,
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
    // Ruta para mostrar el formulario de edición
    {
      method: 'GET',
      path: '/noticias/editar/:id',
      handler: 'noticia.editarNoticiaForm',
      config: {
        auth: false,
      }
    },
    // Ruta para procesar el formulario de edición
    {
      method: 'POST',
      path: '/noticias/editar/:id',
      handler: 'noticia.editarNoticia',
      config: {
        auth: false,
      }
    },
    {
      method: 'GET',
      path: '/noticias/test-scraper',
      handler: 'noticia.testScraper',
      config: {
        auth: false,
      }
    },
    // Ruta para eliminar noticia
    {
      method: 'POST',
      path: '/noticias/eliminar/:id',
      handler: 'noticia.eliminarNoticia',
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
    }
  ]
};
