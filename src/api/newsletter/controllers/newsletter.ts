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
  },

  /**
   * Envío directo de correos sin usar el sistema de cola
   */
  async envioDirecto(ctx) {
    const { type = 'weekly' } = ctx.request.body;
    
    console.log('🚀 Iniciando envío directo...');
    console.log('📝 Request body:', ctx.request.body);
    
    try {
      // Generar contenido del newsletter
      const content = await strapi.service('api::newsletter.newsletter').generateNewsletterContent(type);
      
      // Obtener suscriptores activos
      const subscribers = await strapi.entityService.findMany('api::subscriber.subscriber', {
        filters: { isActive: true }
      });
      
      console.log(`📧 Encontrados ${subscribers.length} suscriptores activos`);
      
      // Resultados del envío
      const resultados = {
        exitos: 0,
        fallos: 0,
        detalles: []
      };
      
      // Enviar directamente a cada suscriptor sin usar la cola
      for (const subscriber of subscribers) {
        try {
          // Usamos directamente el método de envío de email que ya existe
          await strapi.service('api::newsletter.newsletter').sendEmail(subscriber, content);
          
          console.log(`✅ Correo enviado con éxito a ${subscriber.email}`);
          resultados.exitos++;
          resultados.detalles.push({
            email: subscriber.email,
            status: 'success',
            time: new Date()
          });
          
          // Actualizar la fecha del último newsletter
          await strapi.service('api::newsletter.newsletter').updateLastNewsletterSent(subscriber.id);
          
        } catch (error) {
          console.error(`❌ Error al enviar correo a ${subscriber.email}:`, error.message);
          resultados.fallos++;
          resultados.detalles.push({
            email: subscriber.email,
            status: 'failed',
            error: error.message,
            time: new Date()
          });
        }
        
        // Pequeña pausa entre envíos para no saturar el servidor SMTP
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return {
        success: true,
        total: subscribers.length,
        resultados
      };
    } catch (error) {
      console.error('❌ Error en el proceso de envío directo:', error);
      ctx.throw(500, error.message);
      return { success: false, error: error.message };
    }
  }
})); 