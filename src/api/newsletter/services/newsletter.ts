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

  async generateNewsletterContent(type = 'weekly') {
    try {
      console.log('\n📝 Generando contenido del newsletter...');
      
      // Calculamos lastDate solo para mostrar el período del newsletter en el texto
      const lastDate = this.calculateLastDate(type);
      console.log(`Periodo: ${type} (desde ${lastDate.toLocaleString()})`);
      
      // Obtenemos TODAS las noticias publicadas, sin filtrar por fecha
      let noticiasPublicadas = [];
      try {
        noticiasPublicadas = await this.fetchNoticias(lastDate);
        console.log(`Noticias publicadas obtenidas: ${noticiasPublicadas.length}`);
      } catch (fetchError) {
        console.error('❌ Error obteniendo noticias:', fetchError);
        console.log('⚠️ Continuando con 0 noticias...');
      }
      
      // Verificar que tenemos un array válido
      if (!Array.isArray(noticiasPublicadas)) {
        console.log('⚠️ fetchNoticias no devolvió un array válido. Usando array vacío.');
        noticiasPublicadas = [];
      }
      
      // Forzar un array válido y eliminar elementos null/undefined
      const noticiasValidas = noticiasPublicadas.filter(n => n !== null && n !== undefined);
      console.log(`Noticias válidas para el newsletter: ${noticiasValidas.length}`);
      
      // Inicializar con estructura vacía
      let noticiasPorPais: NoticiasPorPais = {
        argentina: [],
        brasil: [],
        chile: [],
        paraguay: [],
        mundo: []
      };
      
      try {
        // Solo intentar agrupar si hay noticias válidas
        if (noticiasValidas.length > 0) {
          noticiasPorPais = this.agruparNoticiasPorPais(noticiasValidas);
        } else {
          console.log('⚠️ No hay noticias válidas para agrupar');
        }
        
        // Log de distribución por país
        console.log('Distribución por país:');
        Object.entries(noticiasPorPais).forEach(([pais, noticias]) => {
          if (Array.isArray(noticias) && noticias.length > 0) {
            console.log(`└── ${pais}: ${noticias.length}`);
          }
        });
      } catch (groupError) {
        console.error('❌ Error agrupando noticias por país:', groupError);
      }
      
      const periodoTexto = this.getPeriodoTexto(type, new Date());
      console.log(`Periodo texto: "${periodoTexto}"`);

      const subject = `Novedades del Corredor Bioceánico - ${format(new Date(), "d 'de' MMMM", { locale: es })}`;
      console.log(`└── Asunto: ${subject}`);
      console.log(`└── Noticias incluidas: ${noticiasValidas.length}`);
      
      return {
        subject,
        content: renderNewsletter(noticiasPorPais, type, periodoTexto),
        noticias: noticiasValidas.map(n => n.id)
      };
    } catch (error) {
      console.error('❌ Error generando contenido:', error);
      
      // Respuesta de emergencia - newsletter vacío pero funcional
      const periodoTexto = this.getPeriodoTexto(type, new Date());
      const emptyStructure: NoticiasPorPais = {
        argentina: [],
        brasil: [],
        chile: [],
        paraguay: [],
        mundo: []
      };
      
      return {
        subject: `Novedades del Corredor Bioceánico - ${format(new Date(), "d 'de' MMMM", { locale: es })}`,
        content: renderNewsletter(emptyStructure, type, periodoTexto),
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
    console.log('\n🚀 Iniciando proceso de newsletter...');
    console.log('📅 Tipo:', type);

    try {
      // Obtener métricas diarias
      const dailyStats = await this.getDailyMetrics();
      console.log('\n Estadísticas diarias:');
      console.log(`└── Enviados hoy: ${dailyStats.totalSent}`);
      console.log(`└── Cuota restante: ${dailyStats.remainingQuota}`);
      console.log(`└── Próximo reinicio: ${dailyStats.nextReset.toLocaleString()}`);

      // Verificar límites
      if (dailyStats.remainingQuota <= 0) {
        throw new Error('Límite diario alcanzado. Próximo reinicio: ' + 
          dailyStats.nextReset.toLocaleString());
      }

      // Control de límites diarios
      const todaysSentCount = await this.getTodaysSentCount();
      console.log(`📊 Correos enviados hoy: ${todaysSentCount}/${LIMITS.DAILY_LIMIT}`);

      // Generar contenido del newsletter
      const content = await this.generateNewsletterContent(type);
      
      if (!content) {
        console.log('No se generó contenido para el newsletter. Abortando.');
        return null;
      }
      
      // Extraer los datos necesarios
      const { subject, content: htmlContent, noticias } = content;
      
      console.log(`└── Asunto: ${subject}`);
      console.log(`└── Noticias incluidas: ${noticias.length}`);

      // Buscar suscriptores activos con la frecuencia correcta
      const subscribers = await strapi.entityService.findMany('api::subscriber.subscriber', {
        filters: {
          isActive: true,
          frequency: type
        }
      });

      if (!subscribers || subscribers.length === 0) {
        console.log('⚠️ No se encontraron suscriptores activos para esta frecuencia.');
        return null;
      }

      // Filtrar suscriptores según la última fecha de envío
      const eligibleSubscribers = await this.filterEligibleSubscribers(subscribers, type);
      
      console.log('\n📧 Resumen de suscriptores:');
      console.log(`└── Total encontrados: ${subscribers.length}`);
      console.log(`└── Elegibles para envío: ${eligibleSubscribers.length}`);
      console.log(`└── Límite diario: ${LIMITS.DAILY_LIMIT}`);
      console.log(`└── Límite por hora: ${LIMITS.HOURLY_LIMIT}`);

      if (eligibleSubscribers.length === 0) {
        console.log('⚠️ No hay suscriptores elegibles para recibir el newsletter en este momento.');
        return null;
      }
      
      try {
        // Crear cola de envío
        const newsletterQueue = await this.createEmailQueue({
          subject: subject,
          content: htmlContent,
          type,
          totalRecipients: eligibleSubscribers.length
        });
        
        console.log('\n📬 Newsletter creado:', {
          id: newsletterQueue.id,
          hasQueue: !!newsletterQueue.queue,
          jobsCount: newsletterQueue.queue?.jobs?.length || 0
        });

        // Verificar si esta es una ejecución de prueba (un solo suscriptor)
        const isSingleSubscriberTest = eligibleSubscribers.length === 1;
        
        if (isSingleSubscriberTest) {
          console.log('🧪 Detectado envío de prueba a un solo suscriptor');
          // Enviar directamente sin crear colas complejas
          const subscriber = eligibleSubscribers[0];
          const emailContent = {
            subject: subject,
            html: htmlContent
          };
          
          const result = await this.sendEmail(subscriber, emailContent);
          
          if (result) {
            console.log(`✅ Correo enviado con éxito a ${subscriber.email}`);
            await this.updateLastNewsletterSent(subscriber.id);
            await this.incrementDailyMetric('emailsSent');
          } else {
            console.log(`❌ Error al enviar correo a ${subscriber.email}`);
            await this.incrementDailyMetric('emailsFailed');
          }
          
          return { success: result, recipient: subscriber.email };
        }

        // Para múltiples suscriptores, seguir con el proceso normal
        // Procesar envío a través de la cola
        return await this.processQueue(newsletterQueue.id);
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
    
    // Guardar hora actual para logs
    const currentTimeStr = today.toLocaleTimeString();
    
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
    
    // Establecer la hora a 00:00:00 (principio del día)
    today.setHours(0, 0, 0, 0);
    
    console.log(`Calculando fecha límite para newsletter tipo: ${type}`);
    console.log(`De: Hora actual (${currentTimeStr})`);
    console.log(`A: ${today.toLocaleString()} (principio del día)`);
    
    return today;
  },

  async fetchNoticias(lastDate: Date) {
    console.log('Buscando noticias desde:', lastDate);
    console.log('Fecha de búsqueda en formato ISO:', lastDate.toISOString());
    
    try {
      // Primer intento con entityService y populate detallado
      console.log('Intentando obtener todas las noticias publicadas con entityService...');
      
      try {
        // Enfoque directo de Strapi v5 con populate específico
        const noticias = await strapi.entityService.findMany('api::noticia.noticia', {
          filters: {
            publishedAt: {
              $ne: null
            }
          },
          populate: {
            featuredImage: true, // Cargar la relación featuredImage
            additionalImages: true, // Cargar imágenes adicionales
            tags: true
          }
        });
        
        console.log(`Noticias encontradas (populate avanzado): ${noticias?.length || 0}`);
        
        if (noticias && noticias.length > 0) {
          // Obtenemos el ID de las noticias para diagnóstico
          console.log('IDs de noticias encontradas:', noticias.map(n => n.id).join(', '));
          
          // Inspeccionar la estructura de featuredImage para diagnóstico
          noticias.forEach(n => {
            if (n.featuredImage) {
              console.log(`Noticia ID ${n.id} - Tipo de featuredImage:`, typeof n.featuredImage);
              console.log(`Noticia ID ${n.id} - Estructura:`, JSON.stringify(n.featuredImage).substring(0, 100) + '...');
            } else {
              console.log(`Noticia ID ${n.id} - Sin featuredImage`);
            }
          });
          
          // Si tenemos resultados, los devolvemos
          return noticias;
        }
      } catch (error) {
        console.error('Error con populate avanzado:', error);
      }
      
      // Si llegamos aquí, el método anterior falló
      // Enfoque alternativo: cargar manualmente las relaciones
      try {
        console.log('Intentando carga manual de relaciones usando files_related_mph...');
        
        // 1. Obtener todas las noticias publicadas
        const noticiasBasicas = await strapi.db.query('api::noticia.noticia').findMany({
          where: { publishedAt: { $ne: null } }
        });
        
        console.log(`Noticias básicas encontradas: ${noticiasBasicas.length}`);
        
        // 2. Para cada noticia, cargar manualmente sus imágenes
        const noticiasCompletas = await Promise.all(
          noticiasBasicas.map(async noticia => {
            try {
              // Cargar las relaciones de archivos para esta noticia
              // Usamos el nombre correcto de la tabla: files_related_mph
              const fileRelations = await strapi.db.query('files_related_mph').findMany({
                where: {
                  related_id: noticia.id,
                  related_type: 'api::noticia.noticia'
                }
              });
              
              console.log(`Noticia ID ${noticia.id} - Relaciones de archivos:`, 
                fileRelations.length > 0 ? fileRelations.length : 'Ninguna');
              
              // Log más detallado de las relaciones
              if (fileRelations.length > 0) {
                fileRelations.forEach(relation => {
                  console.log(`  → Relación: file_id=${relation.file_id}, field=${relation.field}, order=${relation.order}`);
                });
              }
              
              // Cargar los archivos relacionados
              const filePromises = fileRelations.map(async relation => {
                try {
                  // Usar el UID correcto para el modelo de archivos en Strapi v5
                  const file = await strapi.entityService.findOne('plugin::upload.file', relation.file_id);
                  
                  if (file) {
                    console.log(`  → Archivo cargado: id=${file.id}, name=${file.name}, url=${file.url}`);
                  } else {
                    console.log(`  → No se encontró archivo con id=${relation.file_id}`);
                  }
                  
                  return {
                    relation,
                    file
                  };
                } catch (fileError) {
                  console.error(`Error cargando archivo ${relation.file_id}:`, fileError);
                  return { relation, file: null };
                }
              });
              
              // Esperar a que todas las consultas de archivos se completen
              const fileResults = await Promise.all(filePromises);
              
              // Agrupar los archivos por campo
              const files = {};
              fileResults.forEach(result => {
                if (result.file) {
                  const field = result.relation.field;
                  
                  if (!files[field]) {
                    files[field] = result.relation.order === 1 ? result.file : [result.file];
                  } else if (Array.isArray(files[field])) {
                    files[field].push(result.file);
                  } else {
                    files[field] = [files[field], result.file];
                  }
                }
              });
              
              console.log(`Noticia ID ${noticia.id} - Campos de archivos añadidos:`, Object.keys(files).join(', '));
              
              // Añadir los archivos a la noticia
              return {
                ...noticia,
                ...files
              };
            } catch (relationError) {
              console.error(`Error cargando relaciones para noticia ${noticia.id}:`, relationError);
              return noticia;
            }
          })
        );
        
        return noticiasCompletas;
      } catch (manualError) {
        console.error('Error con carga manual:', manualError);
      }
      
      // Enfoque alternativo (el original)
      console.log('Usando enfoque alternativo con filtrado manual...');
      
      // Obtener todas las noticias primero
      const allNoticias = await strapi.db.query('api::noticia.noticia').findMany({});
      console.log(`Total de noticias en la base de datos: ${allNoticias?.length || 0}`);
      
      // Filtrar manualmente por publishedAt no nulo
      const noticiasPublicadas = allNoticias.filter(n => n && n.publishedAt !== null);
      console.log(`Noticias publicadas (filtro manual): ${noticiasPublicadas.length}`);
      
      return noticiasPublicadas;
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
      console.log('⚠️ No hay noticias para agrupar por país');
      return noticiasPorPais;
    }
    
    console.log(`Agrupando ${noticias.length} noticias por país...`);

    noticias.forEach(noticia => {
      if (!noticia) {
        console.log('⚠️ Noticia nula encontrada al agrupar por país');
        return; // Continuar con la siguiente noticia
      }
      
      // Normalizar el país (minúsculas, sin espacios)
      const paisNormalizado = (noticia.pais || '').toLowerCase().trim();
      
      // Diagnóstico
      console.log(`Agrupando noticia ID: ${noticia.id}, Título: ${noticia.title?.substring(0, 25) || 'Sin título'}`);
      console.log(`   → País: ${paisNormalizado || 'No definido'}`);
      
      if (paisNormalizado && noticiasPorPais.hasOwnProperty(paisNormalizado)) {
        noticiasPorPais[paisNormalizado].push(noticia);
        console.log(`Añadiendo noticia "${noticia.title?.substring(0, 30) || 'Sin título'}..." a país: ${paisNormalizado}`);
      } else {
        // Si el país no está en nuestras categorías o no está definido, va a 'mundo'
        noticiasPorPais.mundo.push(noticia);
        console.log(`Noticia con país "${noticia.pais || 'no definido'}" asignada a: mundo`);
      }
    });

    // Log de resultados
    console.log('Resumen de agrupación:');
    Object.entries(noticiasPorPais).forEach(([pais, noticias]) => {
      console.log(`└── ${pais}: ${noticias.length} noticias`);
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

  async sendEmail(subscriber: Subscriber, content: EmailContent) {
    try {
      // Configurar opciones de correo
      const emailOptions = {
        to: subscriber.email,
        from: process.env.SMTP_FROM,
        subject: content.subject,
        html: content.html,
        attachments: [
          {
            filename: 'logo.png',
            path: './public/uploads/thumbnail_CBioceánicoTarapacáfondo blanco.png',
            cid: 'logo' // ID de referencia para usar en el HTML como cid:logo
          },
          {
            filename: 'logo_gore.png',
            path: './public/uploads/LOGO-GORE-TARAPACA-300x140.png',
            cid: 'logo_gore' // ID de referencia para usar en el HTML como cid:logo_gore
          }
        ]
      };

      // Enviar correo
      await strapi.plugins['email'].services.email.send(emailOptions);
      
      // Actualizar la fecha del último newsletter enviado para este suscriptor
      await this.updateLastNewsletterSent(subscriber.id);
      
      return true;
    } catch (error) {
      console.error('Error al enviar email:', error);
      return false;
    }
  },

  /**
   * Actualiza la fecha del último newsletter enviado para un suscriptor específico
   * @param subscriberId ID del suscriptor
   */
  async updateLastNewsletterSent(subscriberId: number) {
    try {
      console.log(`Actualizando fecha de último newsletter para suscriptor ID: ${subscriberId}`);
      
      // Obtener la fecha actual
      const now = new Date();
      
      // Actualizar el campo lastNewsletterSent
      await strapi.db.query('api::subscriber.subscriber').update({
        where: { id: subscriberId },
        data: {
          lastNewsletterSent: now
        }
      });
      
      // Obtener el email del suscriptor para los logs
      const subscriber = await strapi.entityService.findOne('api::subscriber.subscriber', subscriberId);
      
      console.log(`✅ Fecha de último newsletter actualizada para suscriptor: ${subscriber.email} (ID: ${subscriberId})`);
      console.log(`  └── Actualizado a: ${now.toISOString()}`);
      
      // Registrar métricas de actividad
      this.incrementDailyMetric('updateLastNewsletterCount');
      
      return true;
    } catch (error) {
      console.error(`Error al actualizar fecha de último newsletter para suscriptor ID: ${subscriberId}:`, error);
      return false;
    }
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
  },

  /**
   * Incrementa una métrica diaria específica
   * @param metricName Nombre de la métrica a incrementar
   * @param value Valor a incrementar (por defecto 1)
   */
  async incrementDailyMetric(metricName: string, value: number = 1) {
    try {
      // Verificar si el modelo metric existe usando try/catch para mayor seguridad
      let modelExists = false;
      try {
        modelExists = strapi.db.query('api::metric.metric') !== undefined;
      } catch (e) {
        console.log(`⚠️ Error al verificar modelo api::metric.metric: ${e.message}`);
        return false;
      }
      
      if (!modelExists) {
        console.log(`⚠️ Modelo api::metric.metric no encontrado, saltando incremento de métricas`);
        return false;
      }
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const metricKey = `daily_metrics_${today}`;
      
      // Obtener métricas actuales o inicializar
      let metrics = await strapi.db.query('api::metric.metric').findOne({
        where: { key: metricKey }
      });
      
      if (!metrics) {
        // Crear registro de métricas para hoy
        metrics = await strapi.db.query('api::metric.metric').create({
          data: {
            key: metricKey,
            value: JSON.stringify({
              date: today,
              emailsSent: 0,
              emailsFailed: 0,
              subscribersUpdated: 0,
              updateLastNewsletterCount: 0
            })
          }
        });
      }
      
      // Parsear el valor actual
      const currentMetrics = JSON.parse(metrics.value);
      
      // Incrementar la métrica específica
      if (currentMetrics[metricName] !== undefined) {
        currentMetrics[metricName] += value;
      } else {
        currentMetrics[metricName] = value;
      }
      
      // Actualizar el registro
      await strapi.db.query('api::metric.metric').update({
        where: { id: metrics.id },
        data: {
          value: JSON.stringify(currentMetrics)
        }
      });
      
      return true;
    } catch (error) {
      console.error(`Error al incrementar métrica ${metricName}:`, error);
      return false;
    }
  },

  /**
   * Filtra los suscriptores que son elegibles para recibir el newsletter
   * según su frecuencia y la fecha del último envío
   * @param subscribers Lista de suscriptores a filtrar
   * @param type Tipo de newsletter (daily, weekly, monthly)
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
      
      // Determinar elegibilidad según frecuencia
      let isEligible = false;
      
      switch (type) {
        case 'daily':
          // Elegible si han pasado al menos 20 horas (casi un día)
          isEligible = (now.getTime() - lastSent.getTime()) >= (20 * 60 * 60 * 1000);
          break;
        case 'weekly':
          // Elegible si han pasado al menos 6 días
          isEligible = diffInDays >= 6;
          break;
        case 'monthly':
          // Elegible si han pasado al menos 28 días
          isEligible = diffInDays >= 28;
          break;
        default:
          isEligible = true;
      }
      
      if (isEligible) {
        console.log(`  └── Suscriptor ${subscriber.email} elegible (último envío: ${lastSent.toLocaleDateString()})`);
      } else {
        console.log(`  ⛔ Suscriptor ${subscriber.email} NO elegible (último envío hace ${diffInDays} días)`);
      }
      
      return isEligible;
    });
  }
});
