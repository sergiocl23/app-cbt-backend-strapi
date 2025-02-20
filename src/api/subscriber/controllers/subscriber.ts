/**
 * A set of functions called "actions" for `subscriber`
 */
'use strict';

import { factories } from '@strapi/strapi';
const { createCoreController } = factories;

module.exports = createCoreController('api::subscriber.subscriber', ({ strapi }) => ({
  async subscribe(ctx) {
    const { email, name, pais, frequency = 'weekly' } = ctx.request.body;

    try {
      // Validación básica
      if (!email) {
        return ctx.badRequest('Email es requerido');
      }

      if (!pais || !['chile', 'paraguay', 'brasil', 'argentina', 'otro'].includes(pais)) {
        return ctx.badRequest('País no válido');
      }

      // Verificar si ya existe
      const existing = await strapi.entityService.findMany('api::subscriber.subscriber' as any, {
        filters: { email }
      });

      if (existing.length > 0) {
        return ctx.badRequest('Email ya registrado');
      }

      // Crear suscriptor
      const subscriber = await strapi.entityService.create('api::subscriber.subscriber', {
        data: {
          email,
          name,
          pais,
          frequency,
          isActive: true
        }
      });

      // Log para debugging
      console.log('Subscriber creado:', subscriber);

      // Enviar email de bienvenida
      try {
        await strapi.plugins['email'].services.email.send({
          to: email,
          subject: 'Bienvenido al Newsletter del Corredor Bioceánico',
          html: `
            <h1>¡Gracias por suscribirte!</h1>
            <p>Recibirás actualizaciones sobre el Corredor Bioceánico ${frequency === 'weekly' ? 'semanalmente' : 'diariamente'}.</p>
          `
        });
      } catch (emailError) {
        console.error('Error enviando email:', emailError);
        // Continuamos aunque falle el email
      }

      return {
        data: subscriber,
        meta: { message: 'Suscripción exitosa' }
      };

    } catch (error) {
      console.error('Error completo:', error);
      return ctx.badRequest({
        message: 'Error en suscripción',
        details: error.message
      });
    }
  },

  async unsubscribe(ctx) {
    const { id } = ctx.params;

    try {
      const updated = await strapi.entityService.update('api::subscriber.subscriber', id, {
        data: { isActive: false }
      });

      return updated;
    } catch (error) {
      return ctx.badRequest('Error en desuscripción');
    }
  },

  async find(ctx) {
    try {
      const subscribers = await strapi.entityService.findMany('api::subscriber.subscriber', {
        filters: {
          isActive: { $eq: true }
        }
      });

      return {
        data: subscribers
      };
    } catch (error) {
      ctx.throw(500, error);
    }
  },

  async createTestSubscribers(ctx) {
    try {
      const count = ctx.request.body?.count || 1200; // Por defecto crear más que el límite diario
      const subscribers = [];

      for (let i = 0; i < count; i++) {
        const subscriber = await strapi.entityService.create('api::subscriber.subscriber', {
          data: {
            email: `test${i}@example.com`,
            name: `Test User ${i}`,
            pais: i % 2 === 0 ? 'chile' : 'paraguay',
            isActive: true,
            frequency: 'monthly',
            publishedAt: new Date()
          }
        });
        subscribers.push(subscriber);
      }

      return {
        success: true,
        count: subscribers.length,
        message: `Created ${subscribers.length} test subscribers`
      };

    } catch (error) {
      ctx.throw(500, error);
    }
  }
}));
