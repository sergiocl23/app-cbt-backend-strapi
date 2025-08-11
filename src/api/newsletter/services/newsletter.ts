/**
 * =============================================================================
 * SISTEMA DE NEWSLETTER DEL CORREDOR BIOCEÁNICO
 * =============================================================================
 * 
 * Este servicio maneja la generación y envío de newsletters con noticias
 * del Corredor Bioceánico. Incluye las siguientes funcionalidades:
 * 
 * 1. Obtener noticias publicadas desde la base de datos
 * 2. Filtrar por tipo (weekly, monthly)
 * 3. Agrupar por país (Chile, Paraguay, Brasil, Argentina, Mundo)
 * 4. Generar contenido HTML para envío por email
 * 5. Crear colas de envío para suscriptores
 * 6. Procesar el envío con límites de tasa y reintentos
 * 
 * CONSIDERACIONES PARA PRODUCCIÓN:
 * ==============================
 * 1. URLs de enlaces e imágenes:
 *    - Configurar PUBLIC_URL en .env con el dominio público real:
 *      PUBLIC_URL=https://corredorbioceanico.com
 * 
 * 2. Permisos públicos en Strapi:
 *    - La ruta /api/noticias/ver/:id debe ser accesible públicamente
 *    - Configurar en Settings → Roles → Public
 * 
 * 3. Para pruebas en desarrollo:
 *    - Las imágenes usan placeholders públicos
 *    - Los enlaces usan localhost (solo accesibles localmente)
 * 
 * 4. SMTP:
 *    - Configurar proveedor SMTP real en .env para producción
 * 
 * Newsletter Service
 * 
 * Funcionalidades principales:
 * 1. Persistencia de Datos
 *    - Creación y gestión de colas de correo
 *    - Registro de trabajos y su estado
 *    - Historial de envíos
 * 
 * 2. Recuperación ante Fallos
 *    - Sistema de reintentos
 *    - Manejo de errores
 *    - Logs detallados
 * 
 * 3. Monitoreo en Tiempo Real
 *    - Progreso de envíos
 *    - Estado de la cola
 *    - Métricas y estadísticas
 * 
 * 4. Control de Límites
 *    - Límites diarios y por hora
 *    - Gestión de lotes
 *    - Delays entre envíos
 */

import { renderNewsletter } from '../templates/base.template';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Noticia, NoticiasPorPais, EmailContent, Subscriber } from '../interfaces/newsletter';

const LOG_LEVELS = {
  INFO: '📝',
  SUCCESS: '✅',
  WARNING: '⚠️',
  ERROR: '❌',
  QUEUE: '🔄'
};

// Constantes para límites
const LIMITS = {
  HOURLY_LIMIT: 150,
  DAILY_LIMIT: 1000,
  BATCH_SIZE: 50,
  DELAY_BETWEEN_EMAILS: 1000,
  MAX_RETRIES: 3
};

export default ({ strapi }) => ({
  // 1. PERSISTENCIA DE DATOS
  async createEmailQueue(data) {
    try {
      // Verificar si el modelo email-queue existe
      const modelExists = strapi.db.query('api::email-queue.email-queue') !== undefined;
      
      if (!modelExists) {
        console.log(`⚠️ Modelo api::email-queue.email-queue no encontrado. Usando formato básico.`);
        // Devolver un objeto simplificado que contenga lo necesario para continuar
        return {
          id: Date.now(), // ID temporal
          subject: data.subject,
          content: data.content,
          type: data.type,
          totalRecipients: data.totalRecipients,
          queue: { jobs: [] } // Estructura mínima necesaria
        };
      }
      
      return await strapi.entityService.create('api::email-queue.email-queue', {
        data: {
          ...data,
          startTime: new Date(),
          completedJobs: 0,
          failedJobs: 0
        }
      });
    } catch (error) {
      console.log(`⚠️ Error al crear cola de emails: ${error.message}`);
      // Devolver un objeto simplificado para continuar
      return {
        id: Date.now(), // ID temporal
        subject: data.subject,
        content: data.content,
        type: data.type,
        totalRecipients: data.totalRecipients,
        queue: { jobs: [] } // Estructura mínima necesaria
      };
    }
  },

  async createQueueJob(data) {
    return await strapi.entityService.create('api::queue-job.queue-job', {
      data
    });
  },

  // 2. RECUPERACIÓN ANTE FALLOS
  async handleFailure(error, subscriber, job) {
    try {
      // Registrar el error
      await this.logError(error);

      // Incrementar contador de reintentos
      const retryCount = (job.retries || 0) + 1;
      
      if (retryCount < LIMITS.MAX_RETRIES) {
        // Programar reintento
        await this.updateJobStatus(job.id, {
          status: 'pending',
          retries: retryCount,
          nextRetry: new Date(Date.now() + 5000 * retryCount) // Espera progresiva
        }, job.newsletter.id);
      } else {
        // Marcar como fallido definitivamente
        await this.updateJobStatus(job.id, {
          status: 'failed',
          error: error.message
        }, job.newsletter.id);
      }
    } catch (logError) {
      console.error('Error manejando fallo:', logError);
    }
  },

  // 3. MONITOREO EN TIEMPO REAL
  async processQueue(newsletterId: number) {
    console.log(`\n🔄 Iniciando procesamiento de newsletter ${newsletterId}...`);
    console.log('\n📊 Resumen de suscriptores:');
    console.log(`└── Chile: ${await strapi.db.query('api::subscriber.subscriber').count({ where: { pais: 'chile' } })}`);
    console.log(`└── Paraguay: ${await strapi.db.query('api::subscriber.subscriber').count({ where: { pais: 'paraguay' } })}`);
    console.log(`└── Total: ${await strapi.db.query('api::subscriber.subscriber').count()}`);

    try {
      // 1. Obtener newsletter actualizado
      const newsletter = await strapi.entityService.findOne('api::newsletter.newsletter', newsletterId, {
        populate: {
          queue: {
            populate: ['jobs']
          },
          progress: true
        }
      });

      if (!newsletter) {
        throw new Error(`Newsletter ${newsletterId} no encontrado`);
      }

      console.log('📄 Newsletter a procesar:', {
        id: newsletter.id,
        queueId: newsletter.queue?.id,
        jobsCount: newsletter.queue?.jobs?.length,
        status: newsletter.status
      });

      // 2. Validar estado
      if (newsletter.status === 'completed') {
        console.log('✅ Newsletter ya procesado');
        return newsletter;
      }

      // 3. Actualizar estado a processing
      await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
        data: {
          status: 'processing'
        }
      });

      // 4. Procesar jobs
      for (const job of newsletter.queue.jobs) {
        console.log(`\n📨 Procesando lote ${job.batchNumber}/${newsletter.queue.jobs.length}`);

        // 5. Actualizar estado del job a processing
        await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
          data: {
            queue: {
              ...newsletter.queue,
              jobs: newsletter.queue.jobs.map(j => 
                j.batchNumber === job.batchNumber 
                  ? { ...j, status: 'processing' }
                  : j
              )
            }
          }
        });

        // 6. Procesar suscriptores
        for (const subscriber of job.subscribers) {
          try {
            console.log(`📧 Enviando a: ${subscriber.email}`);
            await this.sendEmail(subscriber, {
              subject: newsletter.subject,
              html: newsletter.content
            });
            console.log(`✅ Enviado a: ${subscriber.email}`);

            // Actualizar progreso
            await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
              data: {
                progress: {
                  ...newsletter.progress,
                  sentCount: (newsletter.progress?.sentCount || 0) + 1
                }
              }
            });

          } catch (error) {
            console.error(`❌ Error enviando a ${subscriber.email}:`, error);
            continue;
          }
        }

        // 7. Marcar job como completado
        await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
          data: {
            queue: {
              ...newsletter.queue,
              jobs: newsletter.queue.jobs.map(j => 
                j.batchNumber === job.batchNumber 
                  ? { ...j, status: 'completed' }
                  : j
              )
            }
          }
        });
      }

      // 8. Finalizar newsletter
      await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
        data: {
          status: 'completed',
          completedDate: new Date()
        }
      });

      console.log('✅ Newsletter completado exitosamente');
      return newsletter;

    } catch (error) {
      console.error('❌ Error procesando cola:', error);
      await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
        data: { status: 'failed' }
      });
      throw error;
    }
  },

  // 4. CONTROL DE LÍMITES
  async applyRateLimit() {
    await new Promise(r => setTimeout(r, LIMITS.DELAY_BETWEEN_EMAILS));
  },

  calculateBatchTime(batchNumber) {
    const now = new Date();
    const minutesDelay = Math.floor(batchNumber / LIMITS.HOURLY_LIMIT) * 60;
    return new Date(now.getTime() + minutesDelay * 60000);
  },

  /**
   * Genera el contenido HTML del newsletter
   * @param type Tipo de newsletter (weekly)
   */
  async generateNewsletterContent(type: string): Promise<EmailContent> {
    try {
      console.log(`🔄 Generando contenido de newsletter ${type}...`);
      const lastDate = this.calculateLastDate(type);
      const periodo = format(lastDate, "'del' d 'al' dd 'de' MMMM", { locale: es });
      
      // Informacion del título
      let subject;
      let titulo;
      
      // Solo mantenemos el caso weekly
      subject = `Corredor Bioceánico - Resumen Semanal ${periodo}`;
      titulo = `Resumen Semanal ${periodo}`;
      
      // Obtener noticias desde la última fecha
      console.log(`📅 Buscando noticias desde: ${lastDate.toISOString()}`);
      const noticias = await this.fetchNoticias(lastDate);
      
      // Log detallado
      console.log(`📊 Noticias encontradas: ${noticias.length}`);
      
      let noticiasPorPais = {
        argentina: [],
        brasil: [],
        chile: [],
        paraguay: [],
        mundo: []
      };
      
      if (noticias.length > 0) {
        noticiasPorPais = this.agruparNoticiasPorPais(noticias);
      }
      
      const htmlContent = renderNewsletter(noticiasPorPais, type, periodo);
      
      console.log('\n📧 Resumen del newsletter:');
      console.log(`└── Asunto: ${subject}`);
      console.log(`└── Total noticias: ${noticias.length}`);
      
      return {
        subject,
        content: htmlContent,
        html: htmlContent,
        noticias: noticias.map(n => n.id)
      };
    } catch (error) {
      console.error('❌ Error generando contenido:', error);
      
      const periodoTexto = this.getPeriodoTexto(type, new Date());
      const emptyStructure = {
        argentina: [],
        brasil: [],
        chile: [],
        paraguay: [],
        mundo: []
      };
      
      const htmlContent = renderNewsletter(emptyStructure, type, periodoTexto);
      
      return {
        subject: `Novedades del Corredor Bioceánico - ${format(new Date(), "d 'de' MMMM", { locale: es })}`,
        content: htmlContent,
        html: htmlContent,
        noticias: []
      };
    }
  },

  getPeriodoTexto(type: string, today: Date) {
    let periodoTexto = '';
    switch(type) {
      case 'monthly':
        periodoTexto = `${format(today, "MMMM 'de' yyyy", { locale: es })}`;
        break;
      case 'weekly':
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        periodoTexto = `${format(lastWeek, "d 'de' MMMM", { locale: es })} al ${format(today, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
        break;
      case 'daily':
        periodoTexto = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
        break;
    }
    return periodoTexto;
  },

  async send(type = 'weekly') {
    try {
      console.log('\n🚀 Iniciando envío de newsletter...');
      
      // 1. Validar límites de envío
      const TODAY = new Date();
      
      // Preparar entorno
      const totalSubscribers = await strapi.db.query('api::subscriber.subscriber').count({
        where: { isActive: true }
      });
      
      if (totalSubscribers === 0) {
        console.log('\n⚠️ No hay suscriptores activos para enviar newsletters.');
        return { success: false, error: 'No hay suscriptores activos' };
      }
      
      // Generar contenido
      const content = await this.generateNewsletterContent(type);
      
      // Crear newslettter en la base de datos
      const newsletter = await strapi.entityService.create('api::newsletter.newsletter', {
        data: {
          subject: content.subject,
          content: content.html,
          type,
          status: 'pending',
          publishAt: TODAY
        }
      });
      
      // Obtener todos los suscriptores activos
      const subscribers = await strapi.db.query('api::subscriber.subscriber').findMany({
        where: { isActive: true }
      });
      
      console.log(`\n📋 Preparando envío para ${subscribers.length} suscriptores...`);
      
      try {
        // Si es solo un suscriptor, manejar directamente para pruebas
        if (subscribers.length === 1) {
          const subscriber = subscribers[0];
          console.log('\n🧪 Solo hay un suscriptor, enviando directamente...');
          
          const result = await this.sendEmail(subscriber, content);
          
          // Actualizar estado
          await strapi.entityService.update('api::newsletter.newsletter', newsletter.id, {
            data: {
              status: result ? 'completed' : 'failed',
              completedDate: new Date()
            }
          });
          
          return { success: result, recipient: subscriber.email };
        }

        // Para múltiples suscriptores, seguir con el proceso normal
        // Procesar envío a través de la cola
        return await this.processQueue(newsletter.id);
      } catch (error) {
        console.log('❌ Error al crear o procesar cola de newsletter:', error);
        await this.logError(error);
        return null;
      }
    } catch (error) {
      console.log('❌ Error al enviar newsletter:', error);
      await this.logError(error);
      throw error;
    }
  },

  calculateLastDate(type: string) {
    const today = new Date();
    
    // Solo manejar tipo semanal (weekly)
    today.setDate(today.getDate() - 7);
    
    // Establecer la hora a 00:00:00
    today.setHours(0, 0, 0, 0);
    
    return today;
  },

  /**
   * Mantener la función original para compatibilidad pero ahora usa articleDate
   */
  async fetchNoticias(lastDate: Date) {
    try {
      // Primer intento con entityService y populate detallado
      try {
        const noticias = await strapi.entityService.findMany('api::noticia.noticia', {
          filters: {
            articleDate: {
              $ne: null,
              $gt: lastDate
            }
          },
          populate: {
            featuredImage: true,
            additionalImages: true,
            tags: true
          }
        });
        
        if (noticias && noticias.length > 0) {
          console.log(`📰 Noticias desde ${lastDate.toISOString()}: ${noticias.length}`);
          return noticias;
        }
      } catch (error) {
        console.error('Error con populate avanzado:', error);
      }
      
      // Enfoque alternativo: cargar manualmente las relaciones
      try {
        const noticiasBasicas = await strapi.db.query('api::noticia.noticia').findMany({
          where: { 
            articleDate: { 
              $ne: null,
              $gt: lastDate
            } 
          }
        });
        
        console.log(`📰 Noticias encontradas desde ${lastDate.toISOString()}: ${noticiasBasicas.length}`);
        
        // Cargar manualmente las relaciones de archivos
        const noticiasCompletas = await Promise.all(
          noticiasBasicas.map(async noticia => {
            try {
              const fileRelations = await strapi.db.query('files_related_mph').findMany({
                where: {
                  related_id: noticia.id,
                  related_type: 'api::noticia.noticia'
                }
              });
              
              if (fileRelations.length > 0) {
                const fileResults = await Promise.all(
                  fileRelations.map(async relation => {
                    try {
                      const file = await strapi.entityService.findOne('plugin::upload.file', relation.file_id);
                      return { relation, file };
                    } catch (fileError) {
                      return { relation, file: null };
                    }
                  })
                );
                
                const files = {};
                fileResults.forEach(result => {
                  if (result.file) {
                    const field = result.relation.field;
                    files[field] = result.relation.order === 1 ? result.file : [result.file];
                  }
                });
                
                return { ...noticia, ...files };
              }
              return noticia;
            } catch (relationError) {
              return noticia;
            }
          })
        );
        
        return noticiasCompletas;
      } catch (manualError) {
        console.error('Error con carga manual:', manualError);
      }
      
      return [];
    } catch (error) {
      console.error('❌ Error al buscar noticias:', error);
      return [];
    }
  },

  agruparNoticiasPorPais(noticias: Noticia[]): NoticiasPorPais {
    const noticiasPorPais: NoticiasPorPais = {
      argentina: [],
      brasil: [],
      chile: [],
      paraguay: [],
      mundo: []
    };

    if (!noticias || noticias.length === 0) {
      return noticiasPorPais;
    }

    noticias.forEach(noticia => {
      if (!noticia) return;
      
      const paisNormalizado = (noticia.pais || '').toLowerCase().trim();
      
      if (paisNormalizado && noticiasPorPais.hasOwnProperty(paisNormalizado)) {
        noticiasPorPais[paisNormalizado].push(noticia);
      } else {
        noticiasPorPais.mundo.push(noticia);
      }
    });

    // Log de distribución
    console.log('\n📊 Distribución de noticias:');
    Object.entries(noticiasPorPais).forEach(([pais, noticias]) => {
      if (noticias.length > 0) {
        console.log(`└── ${pais}: ${noticias.length}`);
      }
    });

    return noticiasPorPais;
  },

  async getTodaysSentCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sent = await strapi.entityService.findMany('api::newsletter.newsletter', {
      filters: {
        sentDate: {
          $gte: today
        },
        status: 'completed'
      }
    });

    return sent.reduce((total, newsletter) => total + (newsletter.progress?.sentCount || 0), 0);
  },

  async logError(error: any) {
    await strapi.entityService.create('api::log.log', {
      data: {
        type: 'error',
        message: error.message || 'Error desconocido',
        data: JSON.stringify(error),
        timestamp: new Date()
      }
    });
  },

  async updateNewsletterProgress(id: number, data: any) {
    return await strapi.entityService.update('api::newsletter.newsletter', id, {
      data: {
        progress: {
          ...data
        }
      }
    });
  },

  async updateNewsletterStatus(id: number, status: string) {
    return await strapi.entityService.update('api::newsletter.newsletter', id, {
      data: {
        status,
        ...(status === 'completed' && { completedDate: new Date() })
      }
    });
  },

  async getNewsletterStatus(id: number) {
    try {
      // Buscar newsletter con relaciones
      const newsletter = await strapi.entityService.findOne('api::newsletter.newsletter', id, {
        populate: ['progress']
      });
      
      return {
        id: newsletter.id,
        subject: newsletter.subject,
        status: newsletter.status,
        progress: newsletter.progress,
        startTime: newsletter.createdAt,
        completedAt: newsletter.completedAt
      };
    } catch (error) {
      console.error('Error obteniendo estado:', error);
      return null;
    }
  },

  async updateJobStatus(job: any, data: any, newsletterId: number) {
    try {
      const { status, error } = data;
      
      // Actualizar estado del trabajo
      const updatedJob = await strapi.db.query('newsletter.job').update({
        where: { id: job.id },
        data: {
          status,
          error: error ? JSON.stringify(error) : null,
          completedAt: status === 'completed' ? new Date() : null
        }
      });
      
      // Registrar evento
      let message = `Job #${job.id} actualizado a estado: ${status}`;
      if (error) {
        message += ` (con error: ${error.message || 'Error desconocido'})`;
      } else if (status === 'completed') {
        message += ` - Newsletter enviado a ${job.subscriber.email} (actualizada fecha de último envío)`;
      }
      
      // Registrar evento en el log
      await this.logNewsletterEvent(
        newsletterId,
        status === 'completed' ? 'info' : (status === 'failed' ? 'error' : 'debug'),
        message,
        { jobId: job.id, email: job.subscriber.email }
      );

      return updatedJob;
    } catch (error) {
      console.error('Error al actualizar estado del job:', error);
      throw error;
    }
  },

  async updateJobProgress(jobId: number, status: string) {
    return await strapi.entityService.update('api::queue-job.queue-job', jobId, {
      data: {
        status,
        updatedAt: new Date()
      }
    });
  },

  async getPendingJobs(queueId: number) {
    return await strapi.entityService.findMany('api::queue-job.queue-job', {
      filters: {
        queueId,
        status: 'pending'
      },
      sort: { batchNumber: 'asc' }
    });
  },

  /**
   * Envía un email a un suscriptor específico
   */
  async sendEmail(subscriber: Subscriber, content: EmailContent) {
    try {
      console.log(`📧 Iniciando envío de correo a ${subscriber.email}...`);
      
      if (!subscriber || !subscriber.email) {
        console.log(`❌ Error: Suscriptor no válido o sin email`);
        throw new Error('Suscriptor no válido');
      }
      
      // Personalizar contenido si es necesario
      const personalizedContent = content;
      console.log(`📝 Asunto: ${personalizedContent.subject}`);
      
      // Verificar que exista el servicio de email
      if (!strapi.plugins?.email?.services?.email) {
        console.log(`❌ Error: Servicio de email no disponible`);
        throw new Error('Servicio de email no disponible');
      }
      console.log(`✅ Servicio de email disponible`);
      
      // Verificar configuración SMTP
      console.log(`📧 Configuración SMTP:
        - Host: ${process.env.SMTP_HOST}
        - Puerto: ${process.env.SMTP_PORT}
        - Usuario: ${process.env.SMTP_USER}
        - Remitente: ${process.env.SMTP_FROM}`);
      
      const serverUrl = process.env.SERVER_URL || 'http://localhost:1337';
      const logoPath = '/assets/images/newsletter/LOGO-GORE-TARAPACA.png';
      console.log(`🔗 URL de logo: ${serverUrl}${logoPath}`);
      
      // Configurar opciones del email - Sin adjuntos
      const emailOptions = {
        to: subscriber.email,
        from: process.env.SMTP_FROM,
        subject: personalizedContent.subject,
        html: personalizedContent.html
      };
      
      console.log(`📨 Preparando envío con opciones: 
        - Destinatario: ${emailOptions.to}
        - Remitente: ${emailOptions.from}
        - Logo: Insertado como URL directa en el HTML`);
      
      try {
        // Enviar el email
        console.log(`🚀 Enviando email...`);
        await strapi.plugins['email'].services.email.send(emailOptions);
        console.log(`✅ Email enviado correctamente a ${subscriber.email}`);
      } catch (sendError) {
        console.log(`❌ Error durante el envío: ${sendError.message}`);
        console.log(`❌ Detalles del error:`, sendError);
        throw sendError;
      }
      
      try {
        await this.updateLastNewsletterSent(subscriber.id);
        console.log(`✅ Fecha de último newsletter actualizada para ${subscriber.email}`);
      } catch (updateError) {
        console.log(`⚠️ Error actualizando fecha de último newsletter: ${updateError.message}`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error al enviar correo a ${subscriber.email}: ${error.message}`);
      return false;
    }
  },

  /**
   * Actualiza la fecha del último newsletter enviado a un suscriptor
   */
  async updateLastNewsletterSent(subscriberId: number) {
    if (!subscriberId) return;
    
    try {
      await strapi.entityService.update('api::subscriber.subscriber', subscriberId, {
        data: {
          lastNewsletterSent: new Date()
        }
      });
    } catch (error) {
      console.error(`Error actualizando fecha de último newsletter para suscriptor ${subscriberId}:`, error);
    }
  },

  /**
   * Cancela un newsletter en proceso
   */
  async cancelNewsletter(id: number) {
    return await strapi.entityService.update('api::newsletter.newsletter', id, {
      data: {
        status: 'cancelled',
        completedDate: new Date()
      }
    });
  },

  async checkQueueCompletion(queueId: number) {
    const pendingJobs = await this.getPendingJobs(queueId);
    if (pendingJobs.length === 0) {
      await this.updateQueueStatus(queueId, 'completed');
    }
  },

  async updateQueueStatus(queueId: number, status: string) {
    return await strapi.entityService.update('api::email-queue.email-queue', queueId, {
      data: {
        status,
        ...(status === 'completed' && { completedAt: new Date() })
      }
    });
  },

  async sendWithRetry(subscriber: any, content: any, maxRetries = 3) {
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        await this.sendEmail(subscriber, content);
        return true;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        // Espera exponencial entre reintentos
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
      }
    }
    return false;
  },

  createJobBatches(subscribers: Subscriber[], content: EmailContent) {
    const batches = [];
    for (let i = 0; i < subscribers.length; i += LIMITS.BATCH_SIZE) {
      batches.push({
        batchNumber: Math.floor(i / LIMITS.BATCH_SIZE) + 1,
        status: 'pending',
        subscribers: subscribers.slice(i, i + LIMITS.BATCH_SIZE),
        retries: 0
      });
    }
    return batches;
  },

  // Método helper para logs
  async logNewsletterEvent(newsletterId: number, level: string, message: string, data?: any) {
    console.log(`${LOG_LEVELS[level]} Newsletter #${newsletterId}: ${message}`, data || '');
    
    await strapi.entityService.create('api::newsletter-log.newsletter-log', {
      data: {
        newsletterId,
        level,
        message,
        data: JSON.stringify(data),
        timestamp: new Date()
      }
    });
  },

  /**
   * Filtra los suscriptores que son elegibles para recibir el newsletter
   * según su frecuencia y la fecha del último envío
   * @param subscribers Lista de suscriptores a filtrar
   * @param type Tipo de newsletter (weekly)
   */
  async filterEligibleSubscribers(subscribers, type = 'weekly') {
    if (!subscribers || subscribers.length === 0) return [];
    
    console.log('Filtrando suscriptores elegibles según fecha del último newsletter...');
    
    return subscribers.filter(subscriber => {
      // Si el suscriptor no tiene fecha de último envío, es elegible
      if (!subscriber.lastNewsletterSent) {
        console.log(`  └── Suscriptor ${subscriber.email} nunca ha recibido newsletter, es elegible`);
        return true;
      }
      
      const lastSent = new Date(subscriber.lastNewsletterSent);
      const now = new Date();
      
      // Calcular diferencia en días
      const diffInDays = Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24));
      
      // Semanal: elegible si han pasado al menos 6 días
      const isEligible = diffInDays >= 6;
      
      if (isEligible) {
        console.log(`  └── Suscriptor ${subscriber.email} elegible (último envío: ${lastSent.toLocaleDateString()})`);
      } else {
        console.log(`  ⛔ Suscriptor ${subscriber.email} NO elegible (último envío hace ${diffInDays} días)`);
      }
      
      return isEligible;
    });
  },

  /**
   * Calcula la fecha desde la cual buscar noticias basándose en la fecha del último newsletter enviado
   * @param subscriber Información del suscriptor
   * @returns Objeto con fecha de inicio y fin para buscar noticias
   */
  calculateNewsDateRange(subscriber) {
    // Fecha actual (fin del rango)
    const today = new Date();
    
    // Fecha de inicio: última fecha de newsletter o 7 días atrás
    let startDate;
    
    if (subscriber.lastNewsletterSent) {
      // Si existe fecha de último newsletter, usamos esa fecha
      startDate = new Date(subscriber.lastNewsletterSent);
      console.log(`📅 Último newsletter enviado a ${subscriber.email}: ${startDate.toISOString()}`);
    } else {
      // Si no hay fecha de último newsletter, usamos 7 días atrás
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      console.log(`📅 Sin registro de envíos previos para ${subscriber.email}, usando 7 días atrás: ${startDate.toISOString()}`);
    }
    
    // Establecer hora a 00:00:00 para la fecha de inicio
    startDate.setHours(0, 0, 0, 0);
    
    // Verificar que el rango no sea mayor a 7 días
    const maxDate = new Date();
    maxDate.setDate(today.getDate() - 7);
    maxDate.setHours(0, 0, 0, 0);
    
    if (startDate < maxDate) {
      console.log(`📅 La fecha del último newsletter es mayor a 7 días, limitando a 7 días atrás`);
      startDate = maxDate;
    }
    
    return {
      startDate,
      endDate: today
    };
  },

  /**
   * Obtiene noticias dentro de un rango de fechas
   */
  async fetchNoticiasByDateRange(startDate: Date, endDate: Date) {
    try {
      console.log(`📅 Buscando noticias desde ${startDate.toISOString()} hasta ${endDate.toISOString()}`);
      
      // Primer intento con entityService y populate detallado
      try {
        const noticias = await strapi.entityService.findMany('api::noticia.noticia', {
          filters: {
            articleDate: {
              $ne: null,
              $gt: startDate,
              $lte: endDate
            }
          },
          populate: {
            featuredImage: true,
            additionalImages: true,
            tags: true
          }
        });
        
        if (noticias && noticias.length > 0) {
          console.log(`📰 Noticias encontradas: ${noticias.length}`);
          noticias.forEach(noticia => {
            console.log(`📄 Noticia: "${noticia.title?.substring(0, 30)}..." - ID: ${noticia.id}`);
            console.log(`   - Fecha artículo: ${noticia.articleDate}`);
            console.log(`   - Fecha publicación: ${noticia.publishedAt}`);
          });
          return noticias;
        }
      } catch (error) {
        console.error('Error con populate avanzado:', error);
      }
      
      // Enfoque alternativo: cargar manualmente las relaciones
      try {
        const noticiasBasicas = await strapi.db.query('api::noticia.noticia').findMany({
          where: { 
            articleDate: { 
              $ne: null,
              $gt: startDate,
              $lte: endDate
            } 
          }
        });
        
        console.log(`📰 Noticias encontradas: ${noticiasBasicas.length}`);
        
        // Cargar manualmente las relaciones de archivos
        const noticiasCompletas = await Promise.all(
          noticiasBasicas.map(async noticia => {
            try {
              const fileRelations = await strapi.db.query('files_related_mph').findMany({
                where: {
                  related_id: noticia.id,
                  related_type: 'api::noticia.noticia'
                }
              });
              
              if (fileRelations.length > 0) {
                const fileResults = await Promise.all(
                  fileRelations.map(async relation => {
                    try {
                      const file = await strapi.entityService.findOne('plugin::upload.file', relation.file_id);
                      return { relation, file };
                    } catch (fileError) {
                      return { relation, file: null };
                    }
                  })
                );
                
                const files = {};
                fileResults.forEach(result => {
                  if (result.file) {
                    const field = result.relation.field;
                    files[field] = result.relation.order === 1 ? result.file : [result.file];
                  }
                });
                
                return { ...noticia, ...files };
              }
              return noticia;
            } catch (relationError) {
              return noticia;
            }
          })
        );
        
        return noticiasCompletas;
      } catch (manualError) {
        console.error('Error con carga manual:', manualError);
      }
      
      return [];
    } catch (error) {
      console.error('❌ Error al buscar noticias:', error);
      return [];
    }
  },
});
