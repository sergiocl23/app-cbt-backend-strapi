/**
 * A set of functions called "actions" for `subscriber`
 */
'use strict';

import { factories } from '@strapi/strapi';
const { createCoreController } = factories;
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

module.exports = createCoreController('api::subscriber.subscriber', ({ strapi }) => ({
  async subscribe(ctx) {
    console.log('[TEST SUPER DEBUG] Raw ctx.request.body:', JSON.stringify(ctx.request.body, null, 2));

    // Extraemos el email y ahora también el recaptchaToken
    const { email: rawEmail, recaptchaToken } = ctx.request.body;
    // Siempre usamos 'chile' independientemente de lo que envíe el frontend
    const pais = 'chile';
    
    /*
    console.log('[TEST] Email recibido:', rawEmail);
    console.log('[TEST] Token reCAPTCHA recibido:', recaptchaToken ? 'Sí' : 'No');

    // ---- INICIO DE VERIFICACIÓN reCAPTCHA ----
    if (!recaptchaToken) {
      console.log('[TEST] Error: Falta el token de reCAPTCHA.');
      return ctx.badRequest('Token de reCAPTCHA es requerido.');
    }
    */

    try {
      /*
      const secretKey = process.env.RECAPTCHA_V3_SECRET_KEY;
      if (!secretKey) {
        console.error('[ERROR CRÍTICO] La clave secreta de reCAPTCHA no está configurada en .env');
        return ctx.internalServerError('Error de configuración del servidor (reCAPTCHA).');
      }
      const verificationUrl = `https://www.google.com/recaptcha/api/siteverify`;
      
      console.log('[TEST] Enviando solicitud de verificación de reCAPTCHA a Google...');
      const response = await axios.post(verificationUrl, null, {
        params: {
          secret: secretKey,
          response: recaptchaToken,
          // remoteip: ctx.request.ip // Opcional: IP del usuario.
        }
      });
      
      const recaptchaData = response.data;
      console.log('[TEST] Respuesta de verificación de Google reCAPTCHA:', recaptchaData);

      if (!recaptchaData.success) {
        console.warn('[TEST] Verificación de reCAPTCHA fallida:', recaptchaData['error-codes']);
        return ctx.badRequest({
          message: 'Verificación de reCAPTCHA fallida.',
          details: { errors: recaptchaData['error-codes'] }
        });
      }

      const scoreThreshold = 0.5; 
      if (recaptchaData.score < scoreThreshold) {
        console.warn(`[TEST] Puntuación de reCAPTCHA baja: ${recaptchaData.score}. Posible bot.`);
        // Podrías ser más genérico en el mensaje al usuario para no dar pistas sobre la puntuación
        return ctx.forbidden('No se pudo verificar la solicitud. Inténtalo de nuevo.');
      }
      
      // Asumimos que la acción en el frontend será 'submit_newsletter_subscription'
      if (recaptchaData.action !== 'submit_newsletter_subscription') { 
        console.warn(`[TEST] Acción de reCAPTCHA no coincide. Esperado: 'submit_newsletter_subscription', Recibido: '${recaptchaData.action}'`);
        return ctx.badRequest('Acción de reCAPTCHA inválida.');
      }
      console.log(`[INFO] Verificación de reCAPTCHA exitosa. Puntuación: ${recaptchaData.score}.`);
    // ---- FIN DE VERIFICACIÓN reCAPTCHA ----
    */

      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const email = rawEmail ? rawEmail.toLowerCase().trim() : '';
      // Extraer nombre del email (parte antes del @)
      let name = '';
      const atIndex = email.indexOf('@');
      if (atIndex > 0) {
        name = email.substring(0, atIndex);
        // Opcional: Capitalizar primera letra
        name = name.charAt(0).toUpperCase() + name.slice(1);
      }
      // Validación de email
      if (!email) {
        console.log('[TEST] Error: Email vacío');
        return ctx.badRequest('Email es requerido');
      }

      // Validar formato de email con una expresión regular
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.log('[TEST] Error: Formato de email inválido:', email);
        return ctx.badRequest('Formato de email no válido');
      }

      console.log(`[INFO] Procesando solicitud de suscripción para: ${email}`);

      // Verificar si ya existe
      console.log('[TEST] Buscando si el email ya existe en la base de datos');
      const existing = await strapi.entityService.findMany('api::subscriber.subscriber' as any, {
        filters: { email }
      });
      console.log('[TEST] Resultado de búsqueda:', existing.length > 0 ? 'Encontrado' : 'No encontrado');

      // Si el usuario existe pero está inactivo, lo reactivamos
      if (existing.length > 0) {
        const subscriber = existing[0];
        console.log('[TEST] Detalles del suscriptor existente:', JSON.stringify({
          id: subscriber.id,
          email: subscriber.email,
          isActive: subscriber.isActive,
          pais: subscriber.pais
        }));
        
        if (!subscriber.isActive) {
          console.log(`[INFO] Reactivando suscriptor existente: ${email}`);
          
          // Reactivar suscriptor
          const updated = await strapi.entityService.update('api::subscriber.subscriber', subscriber.id, {
            data: {
              isActive: true,
              frequency: 'weekly' // Siempre actualizamos a weekly
            }
          });
          console.log('[TEST] Suscriptor reactivado con éxito:', JSON.stringify({
            id: updated.id,
            isActive: updated.isActive
          }));

          // Enviar email de bienvenida nuevamente
          try {
            console.log('[TEST] Intentando enviar email de reactivación');
            await strapi.plugins['email'].services.email.send({
              to: email,
              subject: 'Bienvenido de nuevo al Newsletter del Corredor Bioceánico',
              html: `
                <h1>¡Gracias por volver!</h1>
                <p>Recibirás nuevamente actualizaciones semanales sobre el Corredor Bioceánico.</p>
              `
            });
            console.log('[TEST] Email de reactivación enviado con éxito');
          } catch (emailError) {
            console.error('[ERROR] Error enviando email de reactivación:', emailError);
            console.log('[TEST] Detalles del error de email:', emailError.message);
          }

          console.log('[TEST] Retornando respuesta de reactivación exitosa');
          return {
            data: updated,
            meta: { message: 'Suscripción reactivada exitosamente' }
          };
        }
        
        console.log('[TEST] El suscriptor ya está activo, retornando error');
        return ctx.badRequest('Email ya registrado y activo');
      }

      // Crear nuevo suscriptor
      console.log('[TEST] Creando nuevo suscriptor con datos:', JSON.stringify({
        email,
        pais,
        frequency: 'weekly'
      }));

      const token = uuidv4();
      
      const subscriber = await strapi.entityService.create('api::subscriber.subscriber', {
        data: {
          email,
          name,
          pais,
          frequency: 'weekly',
          isActive: true,
          token
        }
      });

      // Log para debugging
      console.log('[INFO] Nuevo suscriptor creado:', {
        id: subscriber.id,
        email: subscriber.email,
        pais: subscriber.pais
      });

      // Enviar email de bienvenida
      try {
        console.log('[TEST] Intentando enviar email de bienvenida');
        await strapi.plugins['email'].services.email.send({
          to: email,
          subject: 'Bienvenido al Newsletter del Corredor Bioceánico',
          html: `
            <h1>¡Gracias por suscribirte!</h1>
            <p>Recibirás actualizaciones semanales sobre el Corredor Bioceánico.</p>
          `
        });
        console.log('[TEST] Email de bienvenida enviado correctamente');
      } catch (emailError) {
        console.error('[ERROR] Error enviando email de bienvenida:', emailError);
        console.log('[TEST] Detalles del error de email:', emailError.message);
        // Continuamos aunque falle el email
      }

      console.log('[TEST] Suscripción completada con éxito, retornando respuesta');
      return {
        data: subscriber,
        meta: { 
          message: 'Suscripción exitosa',
          status: 'success'
        }
      };

    } catch (error) {
      console.error('[ERROR] Error en suscripción:', error);
      console.log('[TEST] Error completo:', error);
      console.log('[TEST] Stack trace:', error.stack);
      return ctx.badRequest({
        message: 'Error en suscripción',
        details: error.message,
        status: 'error'
      });
    }
  },

  // async unsubscribe(ctx) {
  //   const { id } = ctx.params;

  //   try {
  //     const updated = await strapi.entityService.update('api::subscriber.subscriber', id, {
  //       data: { isActive: false }
  //     });

  //     return updated;
  //   } catch (error) {
  //     return ctx.badRequest('Error en desuscripción');
  //   }
  // },

  async unsubscribe(ctx) {
    const { token } = ctx.request.query;

    if (!token) {
      return ctx.badRequest("Token is required");
    }

    try {
      const subscriber = await strapi.db.query("api::subscriber.subscriber").findOne({
        where: { token: token },
      });
  
      if (!subscriber) {
        return ctx.notFound("Invalid or expired token");
      }
  
      await strapi.db.query("api::subscriber.subscriber").update({
        where: { id: subscriber.id },
        data: { isActive: false }
      });

      return { message: "Has sido dado de baja del newsletter" };
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
}));
