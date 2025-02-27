export default {
  /**
   * Scraping de noticias dos veces al día (10 AM y 10 PM)
   */
  scrapeNews: {
    task: async ({ strapi }) => {
      // Mensaje al iniciar el cron
      strapi.log.info('[CRON] Iniciando servicio de scraping automático...');
      strapi.log.info('[CRON] Configurado para ejecutarse a las 10:00 AM y 10:00 PM');
      
      try {
        await strapi.service('api::noticia.noticia-scraper').scrapeNews();
        strapi.log.info('[CRON] Scraping completado exitosamente');
        strapi.log.info(`[CRON] Próxima ejecución: ${new Date().getHours() < 10 ? '10:00 AM' : 
                                                    new Date().getHours() < 22 ? '10:00 PM' : 
                                                    '10:00 AM mañana'}`);
      } catch (error) {
        strapi.log.error('[CRON] Error en scraping:', error);
        strapi.log.error('[CRON] Stack trace:', error.stack);
        strapi.log.error('[CRON] Timestamp:', new Date().toISOString());
      }
    },
    options: {
      rule: '0 10,22 * * *', // Se ejecuta a las 10:00 y 22:00 todos los días
      tz: 'America/Santiago',
      onInit: true
    }
  }
}; 