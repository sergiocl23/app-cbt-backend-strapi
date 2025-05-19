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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { renderNewsletter } from '../templates/base.template';

const { createCoreController } = factories;

module.exports = createCoreController('api::newsletter.newsletter', ({ strapi }) => ({
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

  /**
   * Envío directo de correos sin usar el sistema de cola
   */
  async envioDirecto(ctx) {
    // Usar siempre tipo weekly
    const type = 'weekly';
    
    console.log('==================================================');
    console.log('🚀 INICIANDO PROCESO DE ENVÍO DIRECTO DE NEWSLETTER');
    console.log('==================================================');
    console.log('📝 Request body:', ctx.request.body);
    
    try {
      // Obtener suscriptores activos
      console.log('🔍 Buscando suscriptores activos...');
      const subscribers = await strapi.entityService.findMany('api::subscriber.subscriber', {
        filters: { isActive: true }
      });
      
      console.log(`📧 Encontrados ${subscribers.length} suscriptores activos:`);
      subscribers.forEach(s => console.log(`  - ${s.email} (ID: ${s.id})`));
      
      if (subscribers.length === 0) {
        console.log('⚠️ No hay suscriptores activos para enviar newsletters');
        return {
          success: false,
          message: 'No hay suscriptores activos'
        };
      }
      
      // Resultados del envío
      const resultados = {
        exitos: 0,
        fallos: 0,
        omitidos: 0,
        detalles: []
      };
      
      // Enviar directamente a cada suscriptor sin usar la cola
      for (const subscriber of subscribers) {
        console.log('\n-----------------------------------------');
        console.log(`📧 PROCESANDO SUSCRIPTOR: ${subscriber.email}`);
        console.log('-----------------------------------------');
        
        try {
          // Calcular rango de fechas para este suscriptor
          console.log(`⏱️ Calculando rango de fechas para ${subscriber.email}...`);
          const { startDate, endDate } = await strapi
            .service('api::newsletter.newsletter')
            .calculateNewsDateRange(subscriber);
          
          console.log(`📅 Rango de fechas para ${subscriber.email}: ${startDate.toISOString()} hasta ${endDate.toISOString()}`);
          
          // Obtener noticias para este rango de fechas
          console.log(`📰 Buscando noticias en el rango...`);
          const noticias = await strapi
            .service('api::newsletter.newsletter')
            .fetchNoticiasByDateRange(startDate, endDate);
          
          console.log(`📊 Encontradas ${noticias.length} noticias para ${subscriber.email}`);
          
          if (noticias.length === 0) {
            console.log(`⚠️ No hay noticias nuevas para ${subscriber.email}`);
            resultados.omitidos++;
            resultados.detalles.push({
              email: subscriber.email,
              status: 'skipped',
              reason: 'No hay noticias nuevas',
              time: new Date()
            });
            continue;
          }
          
          // Mostrar IDs de las noticias encontradas
          console.log(`📑 IDs de noticias: ${noticias.map(n => n.id).join(', ')}`);
          
          // Agrupar noticias por país para este suscriptor
          console.log(`🗂️ Agrupando noticias por país...`);
          const noticiasPorPais = await strapi
            .service('api::newsletter.newsletter')
            .agruparNoticiasPorPais(noticias);
          
          // Generar periodo de texto para el newsletter
          const periodoTexto = `del ${format(startDate, "d 'de' MMMM", { locale: es })} al ${format(endDate, "d 'de' MMMM", { locale: es })}`;
          console.log(`📆 Periodo para asunto: ${periodoTexto}`);
          
          // Generar html del newsletter
          console.log(`🖌️ Generando HTML del newsletter...`);
          const htmlContent = renderNewsletter(noticiasPorPais, type, periodoTexto);
          console.log(`✅ HTML generado (longitud: ${htmlContent.length} caracteres)`);
          
          // Crear contenido del email
          const content = {
            subject: `Corredor Bioceánico - Resumen Semanal ${periodoTexto}`,
            html: htmlContent,
            content: htmlContent,
            noticias: noticias.map(n => n.id)
          };
          
          // Enviar email
          console.log(`📩 Enviando email a ${subscriber.email}...`);
          let enviado;
          try {
            enviado = await strapi.service('api::newsletter.newsletter').sendEmail(subscriber, content);
            console.log(`✅ Resultado del envío a ${subscriber.email}: ${enviado ? 'EXITOSO' : 'FALLIDO'}`);
          } catch (sendError) {
            console.error(`❌ Error capturado durante el envío a ${subscriber.email}:`, sendError);
            enviado = false;
          }
          
          if (enviado) {
            console.log(`📨 Correo enviado con éxito a ${subscriber.email}`);
            resultados.exitos++;
            resultados.detalles.push({
              email: subscriber.email,
              status: 'success',
              noticiaCount: noticias.length,
              time: new Date()
            });
            
            // La actualización de lastNewsletter ya se hace dentro de sendEmail
          } else {
            console.error(`❌ Fallo al enviar correo a ${subscriber.email}`);
            resultados.fallos++;
            resultados.detalles.push({
              email: subscriber.email,
              status: 'failed',
              error: 'Error durante el envío',
              time: new Date()
            });
          }
          
        } catch (error) {
          console.error(`❌ Error en el procesamiento para ${subscriber.email}:`, error);
          console.error(error.stack);
          resultados.fallos++;
          resultados.detalles.push({
            email: subscriber.email,
            status: 'failed',
            error: error.message,
            time: new Date()
          });
        }
        
        // Pequeña pausa entre envíos para no saturar el servidor SMTP
        console.log(`⏳ Esperando 1 segundo antes del siguiente envío...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('==================================================');
      console.log('📊 RESUMEN DEL PROCESO DE ENVÍO:');
      console.log(`✅ Exitosos: ${resultados.exitos}`);
      console.log(`❌ Fallidos: ${resultados.fallos}`);
      console.log(`⏭️ Omitidos: ${resultados.omitidos}`);
      console.log('==================================================');
      
      return {
        success: true,
        total: subscribers.length,
        resultados: {
          exitos: resultados.exitos,
          fallos: resultados.fallos,
          omitidos: resultados.omitidos,
          detalles: resultados.detalles
        }
      };
    } catch (error) {
      console.error('❌ ERROR GENERAL EN EL PROCESO:', error);
      console.error(error.stack);
      ctx.throw(500, error.message);
      return { success: false, error: error.message };
    }
  }
})); 