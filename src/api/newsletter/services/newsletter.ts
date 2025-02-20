/**
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
    return await strapi.entityService.create('api::email-queue.email-queue', {
      data: {
        ...data,
        startTime: new Date(),
        completedJobs: 0,
        failedJobs: 0
      }
    });
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

  async generateNewsletterContent(type = 'weekly') {
    try {
      const lastDate = this.calculateLastDate(type);
      const noticiasDelPeriodo = await this.fetchNoticias(lastDate);
      const noticiasPorPais = this.agruparNoticiasPorPais(noticiasDelPeriodo);
      const periodoTexto = this.getPeriodoTexto(type, new Date());

      return {
        subject: `Novedades del Corredor Bioceánico - ${format(new Date(), "d 'de' MMMM", { locale: es })}`,
        content: renderNewsletter(noticiasPorPais, type, periodoTexto),
        noticias: noticiasDelPeriodo.map(n => n.id)
      };
    } catch (error) {
      console.error('Error generando contenido:', error);
      throw error;
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
    console.log('\n🚀 Iniciando proceso de newsletter...');
    console.log('📅 Tipo:', type);

    // Obtener métricas diarias
    const dailyStats = await this.getDailyMetrics();
    console.log('\n�� Estadísticas diarias:');
    console.log(`└── Enviados hoy: ${dailyStats.totalSent}`);
    console.log(`└── Cuota restante: ${dailyStats.remainingQuota}`);
    console.log(`└── Próximo reinicio: ${dailyStats.nextReset.toLocaleString()}`);

    // Verificar límites
    if (dailyStats.remainingQuota <= 0) {
      throw new Error('Límite diario alcanzado. Próximo reinicio: ' + 
        dailyStats.nextReset.toLocaleString());
    }

    try {
      // Control de límites diarios
      const todaysSentCount = await this.getTodaysSentCount();
      console.log(`📊 Correos enviados hoy: ${todaysSentCount}/${LIMITS.DAILY_LIMIT}`);

      if (todaysSentCount >= LIMITS.DAILY_LIMIT) {
        console.log('🛑 Límite diario alcanzado');
        throw new Error(`Límite diario alcanzado (${LIMITS.DAILY_LIMIT})`);
      }

      // Obtener suscriptores activos
      const subscribers = await strapi.entityService.findMany('api::subscriber.subscriber', {
        filters: {
          isActive: true,
          frequency: type
        }
      });

      console.log('\n📧 Resumen de suscriptores:');
      console.log(`└── Total encontrados: ${subscribers.length}`);
      console.log(`└── Límite diario: ${LIMITS.DAILY_LIMIT}`);
      console.log(`└── Límite por hora: ${LIMITS.HOURLY_LIMIT}`);

      if (!subscribers.length) {
        console.log('⚠️ No hay suscriptores activos');
        return { sent: 0 };
      }

      // Generar contenido
      console.log('\n📝 Generando contenido del newsletter...');
      const { subject, content, noticias } = await this.generateNewsletterContent(type);
      console.log(`└── Asunto: ${subject}`);
      console.log(`└── Noticias incluidas: ${noticias.length}`);

      // Crear los jobs primero
      const jobs = this.createJobBatches(subscribers, {
        subject,
        html: content,
        text: content
      });

      console.log('📦 Jobs creados:', jobs.length);

      // Crear newsletter con datos completos
      const newsletter = await strapi.entityService.create('api::newsletter.newsletter', {
        data: {
          subject,
          content,
          type,
          noticias,
          sentDate: new Date(),
          status: 'pending',
          progress: {
            totalSubscribers: subscribers.length,
            sentCount: 0,
            failedCount: 0,
            retryCount: 0
          },
          queue: {
            status: 'pending',
            startTime: new Date(),
            completedJobs: 0,
            failedJobs: 0,
            jobs
          },
          publishedAt: new Date()
        },
        populate: ['queue', 'queue.jobs', 'progress']
      });

      console.log('📬 Newsletter creado:', {
        id: newsletter.id,
        hasQueue: !!newsletter.queue,
        jobsCount: newsletter.queue?.jobs?.length
      });

      // Procesar la cola inmediatamente
      try {
        console.log(`\n🔄 Procesando newsletter ${newsletter.id}...`);

        // Actualizar estado a processing
        await strapi.entityService.update('api::newsletter.newsletter', newsletter.id, {
          data: { status: 'processing' }
        });

        // Procesar cada job
        for (const job of newsletter.queue.jobs) {
          console.log(`\n📨 Procesando lote ${job.batchNumber}/${newsletter.queue.jobs.length}`);

          // Procesar suscriptores
          for (const subscriber of job.subscribers) {
            try {
              console.log(`📧 Enviando a: ${subscriber.email}`);
              await this.sendEmail(subscriber, {
                subject: newsletter.subject,
                html: newsletter.content
              });
              console.log(`✅ Enviado a: ${subscriber.email}`);

              // Actualizar progreso
              await strapi.entityService.update('api::newsletter.newsletter', newsletter.id, {
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
        }

        // Marcar como completado
        await strapi.entityService.update('api::newsletter.newsletter', newsletter.id, {
          data: {
            status: 'completed',
            completedDate: new Date()
          }
        });

        console.log('✅ Newsletter completado exitosamente');

        return {
          newsletterId: newsletter.id,
          status: 'completed',
          totalSubscribers: subscribers.length
        };

      } catch (error) {
        console.error('❌ Error procesando newsletter:', error);
        await strapi.entityService.update('api::newsletter.newsletter', newsletter.id, {
          data: { status: 'failed' }
        });
        throw error;
      }

    } catch (error) {
      console.log('\n❌ Error general:');
      console.log(`└── ${error.message}`);
      await this.logError(error);
      throw error;
    }
  },

  calculateLastDate(type: string) {
    const today = new Date();
    switch(type) {
      case 'monthly':
        today.setMonth(today.getMonth() - 1);
        break;
      case 'weekly':
        today.setDate(today.getDate() - 7);
        break;
      case 'daily':
        today.setDate(today.getDate() - 1);
        break;
    }
    return today;
  },

  async fetchNoticias(lastDate: Date) {
    console.log('Buscando noticias desde:', lastDate);
    const noticias = await strapi.entityService.findMany('api::noticia.noticia', {
      filters: {
        articleDate: {
          $gte: lastDate
        }
      },
      sort: { articleDate: 'desc' },
      populate: ['tags']
    });

    if (noticias.length > 0) {
      console.log('Primera noticia:', JSON.stringify(noticias[0], null, 2));
    }

    return noticias;
  },

  agruparNoticiasPorPais(noticias: Noticia[]): NoticiasPorPais {
    const noticiasPorPais: NoticiasPorPais = {
      argentina: [],
      brasil: [],
      chile: [],
      paraguay: [],
      mundo: []
    };

    noticias.forEach(noticia => {
      if (noticiasPorPais.hasOwnProperty(noticia.pais)) {
        noticiasPorPais[noticia.pais].push(noticia);
      } else {
        // Si el país no está en nuestras categorías, va a 'mundo'
        noticiasPorPais.mundo.push(noticia);
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
    console.error('❌ Error:', error);
    return await strapi.entityService.create('api::newsletter-log.newsletter-log', {
      data: {
        level: 'ERROR',
        message: error.message,
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
    const newsletter = await strapi.entityService.findOne('api::newsletter.newsletter', id, {
      populate: ['progress', 'metrics']
    });

    return {
      id: newsletter.id,
      status: newsletter.status,
      progress: newsletter.progress,
      metrics: newsletter.metrics,
      startTime: newsletter.metrics?.startTime,
      completedDate: newsletter.completedDate
    };
  },

  async updateJobStatus(job: any, data: any, newsletterId: number) {
    console.log('📝 Actualizando estado del job:', {
      newsletterId,
      jobBatch: job.batchNumber,
      newStatus: data.status
    });

    const newsletter = await strapi.entityService.findOne('api::newsletter.newsletter', newsletterId, {
      populate: ['queue', 'queue.jobs']
    });

    console.log('📄 Newsletter encontrado:', {
      id: newsletter?.id,
      hasQueue: !!newsletter?.queue,
      jobsCount: newsletter?.queue?.jobs?.length
    });

    if (!newsletter || !newsletter.queue) {
      console.error('❌ Newsletter o cola no encontrados');
      throw new Error(`Newsletter ${newsletterId} o su cola no encontrados`);
    }

    const updatedJobs = newsletter.queue.jobs.map(queueJob => {
      if (queueJob.batchNumber === job.batchNumber) {
        console.log(`✏️ Actualizando job ${queueJob.batchNumber}:`, data);
        return { ...queueJob, ...data };
      }
      return queueJob;
    });

    console.log('📊 Jobs actualizados:', updatedJobs.length);

    return await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
      data: {
        queue: {
          ...newsletter.queue,
          jobs: updatedJobs
        }
      }
    });
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

  async sendEmail(subscriber: Subscriber, content: EmailContent) {
    return await strapi.plugins['email'].services.email.send({
      to: subscriber.email,
      subject: content.subject,
      html: content.html,
      text: content.text
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

  async updateMetrics(newsletterId: number, metrics: any) {
    return await strapi.entityService.update('api::newsletter.newsletter', newsletterId, {
      data: {
        metrics: {
          ...metrics,
          lastUpdated: new Date()
        }
      }
    });
  },

  async getDailyMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const metrics = await strapi.entityService.findMany('api::newsletter.newsletter', {
      filters: {
        createdAt: {
          $gte: today
        }
      },
      populate: ['metrics', 'progress']
    });

    const dailyStats = {
      totalSent: 0,
      remainingQuota: LIMITS.DAILY_LIMIT,
      nextReset: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      newsletters: metrics.length
    };

    metrics.forEach(newsletter => {
      if (newsletter.progress?.sentCount) {
        dailyStats.totalSent += newsletter.progress.sentCount;
        dailyStats.remainingQuota -= newsletter.progress.sentCount;
      }
    });

    return dailyStats;
  }
});
