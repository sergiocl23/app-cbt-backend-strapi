/**
 * Newsletter Controller
 * 
 * Responsabilidades:
 * 1. Validación de peticiones
 * 2. Manejo de respuestas HTTP
 * 3. Orquestación de servicios
 */

'use strict';

import { factories } from '@strapi/strapi';
const { createCoreController } = factories;

module.exports = createCoreController('api::newsletter.newsletter', ({ strapi }) => ({
  async testSend(ctx) {
    try {
      const { type = 'weekly' } = ctx.request.body;
      if (!['daily', 'weekly', 'monthly'].includes(type)) {
        return ctx.badRequest('Tipo de newsletter inválido');
      }

      console.log('🚀 Iniciando envío de prueba...');
      console.log('📝 Request body:', ctx.request.body);

      const result = await strapi.service('api::newsletter.newsletter').send(type);

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return ctx.throw(500, error.message);
    }
  },

  async getStatus(ctx) {
    try {
      const { id } = ctx.params;
      
      const status = await strapi
        .service('api::newsletter.newsletter')
        .getNewsletterStatus(id);

      return {
        success: true,
        data: status
      };

    } catch (error) {
      return ctx.throw(500, 'Error obteniendo estado del newsletter');
    }
  },

  async cancel(ctx) {
    try {
      const { id } = ctx.params;
      
      await strapi
        .service('api::newsletter.newsletter')
        .cancelNewsletter(id);

      return {
        success: true,
        message: 'Newsletter cancelado correctamente'
      };

    } catch (error) {
      return ctx.throw(500, 'Error cancelando el newsletter');
    }
  },

  async getMetrics(ctx) {
    try {
      const metrics = await strapi
        .service('api::newsletter.newsletter')
        .getDailyMetrics();

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      return ctx.throw(500, error.message);
    }
  }
})); 