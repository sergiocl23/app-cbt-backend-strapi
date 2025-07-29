export default {
  /**
   * Scraping de noticias por país a las 15:13 todos los días
   */
  batchScrapeByCountry: {
    task: async ({ strapi }) => {
      // Mensaje al iniciar el cron
      strapi.log.info('[CRON] Iniciando servicio de scraping por país automático...');
      strapi.log.info('[CRON] Configurado para ejecutarse a las 15:13');
      
      try {
        await strapi.service('api::noticia.noticia-scraper').batchScrapeByCountry();
        strapi.log.info('[CRON] Scraping por país completado exitosamente');
        strapi.log.info(`[CRON] Próxima ejecución: 15:13 mañana`);
      } catch (error) {
        strapi.log.error('[CRON] Error en scraping por país:', error);
        strapi.log.error('[CRON] Stack trace:', error.stack);
        strapi.log.error('[CRON] Timestamp:', new Date().toISOString());
      }
    },
    options: {
      rule: '0 6,18 * * *', // Se ejecuta a las 06:00 y 18:00 todos los días
      tz: 'America/Santiago',
      onInit: false // No se ejecuta al iniciar el servidor
    }
  },

  /**
   * Envío automático de newsletter diario a las 08:00
   */
  autoSendNewsletter: {
    task: async ({ strapi }) => {
      strapi.log.info('[CRON] Iniciando envío automático de newsletter...');
      try {
        // const res = await fetch('http://localhost:1337/api/newsletters/envio-directo', {
        const res = await fetch(process.env.PUBLIC_URL+'/api/newsletters/envio-directo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Si el endpoint requiere autenticación, agrega:
            // 'Authorization': 'Bearer TU_TOKEN_AQUI'
          }
        });

        const result = await res.json();
        strapi.log.info('[CRON] Newsletter enviado correctamente: ' + JSON.stringify(result));
      } catch (error) {
        strapi.log.error('[CRON] Error al enviar newsletter:', error);
        strapi.log.error('[CRON] Stack trace:', error.stack);
        strapi.log.error('[CRON] Timestamp:', new Date().toISOString());
      }
    },
    options: {
      rule: '0 8 * * 1', // A las 08:00, solo los lunes
      // rule: '*/2 * * * *', // Cada 2 minutos
      tz: 'America/Santiago',
      onInit: false
    }
  },

  /**
   * Envío automático de notificaciones del foro a las 08:00 AM todos los días
   */
  autoSendNewCommentsNotifications: {
    task: async ({ strapi }) => {
      strapi.log.info('[CRON] Iniciando envío automático de notificaciones del foro...');

      try {
        const res = await fetch(process.env.PUBLIC_URL + '/api/topic/notifications/new-comments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Agrega el token si es necesario para proteger el endpoint
            // 'Authorization': 'Bearer TU_TOKEN_AQUI'
          }
        });

        const result = await res.json();
        strapi.log.info('[CRON] Notificaciones enviadas correctamente: ' + JSON.stringify(result));
      } catch (error) {
        strapi.log.error('[CRON] Error al enviar notificaciones del foro:', error);
        strapi.log.error('[CRON] Stack trace:', error.stack);
        strapi.log.error('[CRON] Timestamp:', new Date().toISOString());
      }
    },
    options: {
      rule: '0 11 * * *', // Todos los días a las 08:00
      tz: 'America/Santiago',
      onInit: false
    }
  },

  
}; 