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
      rule: '13 15 * * *', // Se ejecuta a las 15:13 todos los días
      tz: 'America/Santiago',
      onInit: false // No se ejecuta al iniciar el servidor
    }
  }
}; 