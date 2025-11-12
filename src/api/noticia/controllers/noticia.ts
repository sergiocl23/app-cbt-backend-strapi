import { factories } from '@strapi/strapi'
import slugify from 'slugify';



// Usar el logger del scraper
const logger = {
  info: (...args: any[]) => console.log('\x1b[36m%s\x1b[0m', '[INFO]', ...args),
  warn: (...args: any[]) => console.log('\x1b[33m%s\x1b[0m', '[WARN]', ...args),
  error: (...args: any[]) => console.log('\x1b[31m%s\x1b[0m', '[ERROR]', ...args),
};




interface PaginationQuery {
  pagination?: {
    page?: number;
    pageSize?: number;
  };
  filters?: any;
  sort?: string;
  populate?: string;
}



interface FilterParams {
  tags?: string;
  startDate?: string;
  endDate?: string;
  pais?: string;
}




export default factories.createCoreController('api::noticia.noticia', ({ strapi }) => ({
  async find(ctx) {
    try {
      logger.info('\n=== INICIO DE BÚSQUEDA ===');
      logger.info('Query params completos:', JSON.stringify(ctx.query, null, 2));

      const { 
        pagination = {}, 
        filters = {}, 
        sort = 'articleDate:desc', 
        populate = '*' 
      } = ctx.query as PaginationQuery;
      
      const { 
        tags, 
        startDate, 
        endDate, 
        pais 
      } = ctx.query as FilterParams;

      logger.info('\n=== PARÁMETROS EXTRAÍDOS ===');
      logger.info('Paginación:', JSON.stringify(pagination));
      logger.info('Filtros base:', JSON.stringify(filters));
      logger.info('Ordenamiento:', sort);
      logger.info('Populate:', populate);

      // Construir filtros avanzados
      const advancedFilters: any = { ...filters };

      // Manejar el caso especial para relevanceScore nulo
      if (advancedFilters.relevanceScore && advancedFilters.relevanceScore.$null === 'true') {
        // Reemplazar el operador $null por $eq: null manteniendo el nombre del campo en camelCase
        advancedFilters.relevanceScore = {
          $eq: null
        };
      }

      // Manejar conversión de strings a booleanos para manualCreation
      if (advancedFilters.manualCreation && advancedFilters.manualCreation.$eq) {
        // Convertir string "true"/"false" a boolean true/false
        if (advancedFilters.manualCreation.$eq === 'true') {
          advancedFilters.manualCreation.$eq = true;
        } else if (advancedFilters.manualCreation.$eq === 'false') {
          advancedFilters.manualCreation.$eq = false;
        }
      }

      // NUEVA LÓGICA PARA FILTRADO DE TAGS CON COMPORTAMIENTO AND
      if (advancedFilters.tags && advancedFilters.tags.nombre && advancedFilters.tags.nombre.$in && Array.isArray(advancedFilters.tags.nombre.$in)) {
        const tagNamesToFilter = advancedFilters.tags.nombre.$in;

        if (tagNamesToFilter.length > 0) {
          // Crear las condiciones AND para cada tag
          const tagAndConditions = tagNamesToFilter.map(tagName => ({
            tags: { // Nombre de la relación en el modelo 'noticia'
              nombre: { // Campo por el cual filtrar dentro del modelo 'tag'
                $eq: tagName
              }
            }
          }));

          // Eliminar el filtro original 'tags.nombre.$in' para evitar conflictos
          delete advancedFilters.tags.nombre.$in;
          // Limpiar el objeto 'nombre' si queda vacío
          if (Object.keys(advancedFilters.tags.nombre).length === 0) {
            delete advancedFilters.tags.nombre;
          }
          // Limpiar el objeto 'tags' si queda vacío
          if (Object.keys(advancedFilters.tags).length === 0) {
            delete advancedFilters.tags;
          }

          // Añadir las nuevas condiciones al filtro $and global
          if (advancedFilters.$and && Array.isArray(advancedFilters.$and)) {
            // Si ya existe un $and (por otros filtros), añadir las condiciones de tags
            advancedFilters.$and.push(...tagAndConditions);
          } else {
            // Si no existe $and, crearlo con las condiciones de tags
            advancedFilters.$and = tagAndConditions;
          }
        }
        // Nota: Si tagNamesToFilter.length es 0, no se hace nada.
        // Si es 1, la lógica anterior con $in funcionaba bien, y esta nueva
        // lógica con $and y una sola condición $eq también es correcta.
        // El cambio principal es para múltiples tags.
      }
      // La lógica anterior para ctx.query.tags (que se basaba en un parámetro `tags` directo en la URL)
      // ha sido eliminada/reemplazada por esta, ya que los logs indican que los tags vienen
      // a través de filters[tags][nombre][$in].

      // Filtrar por país
      if (pais) {
        advancedFilters.pais = { $eq: (pais as string).toLowerCase() };
      }

      // Filtrar por rango de fechas
      if (startDate || endDate) {
        logger.info('\n=== PROCESAMIENTO DE FECHAS ===');
        logger.info('Zona horaria del servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);
        logger.info('Hora actual del servidor:', new Date().toISOString());
        
        advancedFilters.articleDate = {};
        
        if (startDate) {
          const startRaw = new Date(startDate as string);
          logger.info('Fecha inicio (raw):', startRaw.toISOString());
          logger.info('Timestamp inicio (raw):', startRaw.getTime());
          
          const start = new Date(startDate as string);
          start.setUTCHours(0, 0, 0, 0);
          advancedFilters.articleDate.$gte = start;
          
          logger.info('Fecha inicio procesada:', start.toISOString());
          logger.info('Timestamp inicio procesado:', start.getTime());
        }
        
        if (endDate) {
          const endRaw = new Date(endDate as string);
          logger.info('Fecha fin (raw):', endRaw.toISOString());
          logger.info('Timestamp fin (raw):', endRaw.getTime());
          
          const end = new Date(endDate as string);
          end.setUTCHours(23, 59, 59, 999);
          advancedFilters.articleDate.$lte = end;
          
          logger.info('Fecha fin procesada:', end.toISOString());
          logger.info('Timestamp fin procesado:', end.getTime());
        }

        // Agregar log de la consulta SQL generada
        logger.info('\n=== QUERY SQL GENERADO ===');
        const query = strapi.db.connection('noticias')
          .where(advancedFilters)
          .toSQL();
        logger.info('SQL:', query.sql);
        logger.info('Bindings:', query.bindings);
      }

      // Validar paginación
      const validatedPageSize = Math.min(Math.max(1, pagination.pageSize || 10), 100);
      const validatedPage = Math.max(1, pagination.page || 1);

      logger.info('\n=== CONSULTA FINAL A BASE DE DATOS ===');
      logger.info('Filtros completos:', JSON.stringify(advancedFilters, null, 2));
      logger.info('Parámetros de paginación:', JSON.stringify({
        page: validatedPage,
        pageSize: validatedPageSize
      }, null, 2));

      // Obtener resultados
      const { results: noticias, pagination: paginatedResults } = await strapi
        .service('api::noticia.noticia')
        .find({
          filters: advancedFilters,
          pagination: {
            page: validatedPage,
            pageSize: validatedPageSize
          },
          sort,
          populate
        });

      logger.info('\n=== RESULTADOS OBTENIDOS ===');
      logger.info('Total noticias:', noticias.length);
      
      if (noticias.length > 0) {
        const fechas = noticias.map(n => new Date(n.articleDate));
        const timestamps = fechas.map(d => d.getTime());
        
        logger.info('\n=== DETALLE DE FECHAS ENCONTRADAS ===');
        noticias.forEach((noticia, index) => {
          logger.info(`Noticia ${index + 1}:`, {
            id: noticia.id,
            titulo: noticia.title,
            fecha: noticia.articleDate,
            timestamp: new Date(noticia.articleDate).getTime()
          });
        });

        logger.info('\n=== RANGO DE FECHAS ENCONTRADO ===');
        logger.info('Primera fecha:', new Date(Math.min(...timestamps)).toISOString());
        logger.info('Última fecha:', new Date(Math.max(...timestamps)).toISOString());
      }

      ctx.body = {
        status: 'success',
        data: noticias.map(noticia => ({
          id: noticia.id,
          title: noticia.title,
          summary: noticia.summary,
          sourceUrl: noticia.sourceUrl,
          articleDate: noticia.articleDate,
          pais: noticia.pais,
          tags: noticia.tags,
          mainImage: noticia.mainImage
        })),
        meta: {
          pagination: paginatedResults,
          filters: {
            availableTags: await this.getAvailableTags(),
            availablePaises: ['chile', 'paraguay', 'brasil', 'argentina', 'mundo']
          }
        }
      };
    } catch (error) {
      ctx.body = {
        status: 'error',
        error: error.message
      };
      ctx.status = 400;
    }
  },
  // Helper para obtener tags disponibles
  async getAvailableTags() {
    // Usar el entity service para obtener todos los tags con sus IDs y nombres
    const tagsResult = await strapi.entityService.findMany('api::tag.tag', {
      fields: ['id', 'nombre'],
      sort: { nombre: 'asc' }
    });
    
    // Devolver el array de objetos con id y nombre
    return tagsResult;
  },
 
  // Método para generar resumen usando IA
  async generarResumen(ctx) {
    try {
      const { content, title } = ctx.request.body;
      
      if (!content || typeof content !== 'string') {
        return ctx.badRequest('El contenido es requerido y debe ser texto');
      }
      
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      
      if (wordCount < 100) {
        return ctx.badRequest('El contenido debe tener al menos 100 palabras');
      }
      
      console.log(`Generando resumen para contenido de ${wordCount} palabras`);
      
      // Importar y utilizar directamente la función de generación de resumen
      try {
        // Importar HfInference de @huggingface/inference
        const { HfInference } = require('@huggingface/inference');
        const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');
        
        // Función para generar resumen
        async function generateSummary(textContent, textTitle) {
          if (!process.env.HUGGINGFACE_API_KEY) {
            console.error('HUGGINGFACE_API_KEY no está configurada');
            return textContent.split('.')[0].substring(0, 147) + '...';
          }
          
          const textToSummarize = textContent.length > 2000 
            ? textContent.substring(0, 2000) 
            : textContent;
            
          const summaryOutput = await hf.summarization({
            model: 'Falconsai/text_summarization',
            inputs: textToSummarize,
            parameters: {
              max_length: 150,
              min_length: 30,
              do_sample: false,
              num_beams: 4,
              early_stopping: true
            }
          });
          
          if (!summaryOutput?.summary_text) throw new Error('No se generó resumen');
          
          const summary = summaryOutput.summary_text.trim();
          const lines = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
          
          return lines.length > 4 
            ? lines.slice(0, 4).join('. ') + '...'
            : summary.endsWith('.') ? summary : summary + '.';
        }
      
      // Generar el resumen
      const summary = await generateSummary(content, title || '');
      
      return ctx.send({ summary });
      } catch (aiError) {
        console.error('Error al utilizar la IA para generar resumen:', aiError);
        return ctx.badRequest('Error al procesar la IA para generar el resumen');
      }
    } catch (error) {
      console.error('Error al generar resumen:', error);
      return ctx.badRequest('Error al generar el resumen');
    }
  },
 
  // Método para publicar una noticia desde la vista
  async publicarNoticia(ctx) {
    try {
      const { id } = ctx.params;
      console.log(`Publicando noticia con ID: ${id}`);
      
      if (!id) {
        return ctx.badRequest('Se requiere un ID de noticia');
      }

      // Verificar que la noticia existe
      const noticia = await strapi.db.query('api::noticia.noticia').findOne({
        where: { id: parseInt(id) }
      });

      if (!noticia) {
        return ctx.notFound('Noticia no encontrada');
      }

      if (noticia.publishedAt) {
        console.log('La noticia ya está publicada');
        return ctx.send({
          message: 'La noticia ya está publicada',
          redirect: '/api/noticias/listar'
        });
      }

      // Publicar la noticia directamente en la base de datos
      await strapi.db.query('api::noticia.noticia').update({
        where: { id: parseInt(id) },
        data: {
          publishedAt: new Date()
        }
      });

      console.log(`Noticia con ID ${id} publicada exitosamente`);

      // Redireccionar a la lista de noticias
      ctx.redirect('/api/noticias/listar');
    } catch (error) {
      console.error('Error al publicar noticia:', error);
      ctx.internalServerError('Error al publicar la noticia');
    }
  },

  // Método para despublicar una noticia desde la vista
  async despublicarNoticia(ctx) {
    try {
      const { id } = ctx.params;
      console.log(`Despublicando noticia con ID: ${id}`);
      
      if (!id) {
        return ctx.badRequest('Se requiere un ID de noticia');
      }

      // Verificar que la noticia existe
      const noticia = await strapi.db.query('api::noticia.noticia').findOne({
        where: { id: parseInt(id) }
      });

      if (!noticia) {
        return ctx.notFound('Noticia no encontrada');
      }

      if (!noticia.publishedAt) {
        console.log('La noticia ya está en modo borrador');
        return ctx.send({
          message: 'La noticia ya está en modo borrador',
          redirect: '/api/noticias/listar'
        });
      }

      // Despublicar la noticia directamente en la base de datos
      await strapi.db.query('api::noticia.noticia').update({
        where: { id: parseInt(id) },
        data: {
          publishedAt: null
        }
      });

      console.log(`Noticia con ID ${id} despublicada exitosamente`);

      // Redireccionar a la lista de noticias
      ctx.redirect('/api/noticias/listar');
    } catch (error) {
      console.error('Error al despublicar noticia:', error);
      ctx.internalServerError('Error al despublicar la noticia');
    }
  },

  // Método para procesar el formulario de creación
  async crearNoticia(ctx) {
    const startTime = Date.now();
    console.log(`\n=== CREANDO NOTICIA: INICIO (${new Date().toISOString()}) ===`);
    console.log(`Información de la solicitud: ${ctx.method} ${ctx.url}`);
    console.log(`Content-Type: ${ctx.request.headers['content-type']}`);
    console.log(`User-Agent: ${ctx.request.headers['user-agent']}`);
    
    try {
      // Parsear body y extraer datos básicos
      console.log('\n[FASE 1] Procesando datos del formulario...');
      
      const formBody = ctx.request.body || {};
      console.log('Contenido del body:', Object.keys(formBody));
      
      let noticiaData = {} as any;
      let featuredImageId = null;
      let additionalImagesIds = [];
      
      // Procesar datos según el tipo de contenido
      if (ctx.is('multipart')) {
        console.log('Procesando archivos multipart...');
        console.log('Profundidad del body:', JSON.stringify(Object.keys(ctx.request.body)));
        
        // Intenta obtener la estructura completa sin circular references
        try {
          const safeBody = {};
          Object.keys(ctx.request.body).forEach(key => {
            if (key === 'files') {
              safeBody[key] = 'objeto de archivos (no serializable)';
            } else {
              safeBody[key] = ctx.request.body[key];
            }
          });
          console.log('Estructura simplificada del body:', JSON.stringify(safeBody, null, 2));
        } catch (jsonError) {
          console.log('No se pudo serializar el body completo:', jsonError.message);
        }
        
        // En algunos entornos, los archivos pueden estar en diferentes ubicaciones
        const bodyFiles = ctx.request.body.files || {};
        const formFiles = formBody.files || {};
        const files = bodyFiles || formFiles;
        
        console.log('Estructura de files disponible en:', Object.keys(ctx.request.body).includes('files') ? 'ctx.request.body.files' : 
                                                         (formBody.files ? 'formBody.files' : 'ninguno'));
        console.log('Estructura de archivos:', files ? Object.keys(files) : 'no disponible');
        
        // Detallar todas las posibles ubicaciones de los archivos
        try {
          if (ctx.request.files) {
            console.log('Archivos en ctx.request.files:', Object.keys(ctx.request.files));
            
            // Agregamos logs más detallados sobre las imágenes adicionales en ctx.request.files
            if (ctx.request.files.additionalImages) {
              console.log('Encontradas imágenes adicionales en ctx.request.files.additionalImages');
              const addImages = ctx.request.files.additionalImages;
              console.log('Tipo de additionalImages:', typeof addImages);
              console.log('Es array:', Array.isArray(addImages));
              console.log('Contiene:', Array.isArray(addImages) ? addImages.length : '1 archivo');
            }
          }
          if (ctx.request.body.files) {
            console.log('Archivos en ctx.request.body.files:', Object.keys(ctx.request.body.files));
          }
          if (formBody.files) {
            console.log('Archivos en formBody.files:', Object.keys(formBody.files));
          }
        } catch (e) {
          console.log('Error al listar archivos:', e.message);
        }
        
        // Extraer datos básicos
        if (ctx.request.body.data) {
          try {
            // Los datos pueden venir como string JSON
            if (typeof ctx.request.body.data === 'string') {
              noticiaData = JSON.parse(ctx.request.body.data);
              console.log('Datos parseados del JSON string');
            } else {
              noticiaData = ctx.request.body.data;
              console.log('Datos obtenidos directamente del objeto data');
            }
          } catch (parseError) {
            console.error('Error al parsear datos:', parseError);
            noticiaData = {};
          }
        } else {
          // Si no hay data, usamos el body directamente
          noticiaData = formBody;
          console.log('Usando formBody directamente para datos');
        }
        
        // Imagen destacada - Probar diferentes ubicaciones posibles
        console.log('\nProcesando imagen destacada:');
        if (files && files.featuredImage) {
          try {
            console.log('Encontrada imagen destacada en files.featuredImage');
            console.log('Información de la imagen destacada:', 
              typeof files.featuredImage === 'object' ? 
              JSON.stringify({
                name: files.featuredImage.name,
                size: files.featuredImage.size,
                type: files.featuredImage.type
              }) : 'formato no estándar');
              
            const uploadedImage = await strapi.plugins.upload.services.upload.upload({
              data: {},
              files: files.featuredImage
            });
            
            featuredImageId = uploadedImage[0].id;
            console.log(`Nueva imagen destacada subida con ID: ${featuredImageId}`);
          } catch (uploadError) {
            console.error('Error al subir imagen destacada:', uploadError);
          }
        } else if (files && files['files.featuredImage']) {
          // Alternativamente, el nombre podría incluir 'files.' como prefijo
          try {
            console.log('Encontrada imagen destacada en files["files.featuredImage"]');
            console.log('Información de la imagen alternativa:',
              typeof files['files.featuredImage'] === 'object' ?
              JSON.stringify({
                name: files['files.featuredImage'].name,
                size: files['files.featuredImage'].size,
                type: files['files.featuredImage'].type
              }) : 'formato no estándar');
              
            const uploadedImage = await strapi.plugins.upload.services.upload.upload({
              data: {},
              files: files['files.featuredImage']
            });
            
            featuredImageId = uploadedImage[0].id;
            console.log(`Nueva imagen destacada (ruta alternativa) subida con ID: ${featuredImageId}`);
          } catch (uploadError) {
            console.error('Error al subir imagen destacada (ruta alternativa):', uploadError);
          }
        } else {
          console.log('No se encontró ninguna imagen destacada');
        }
        
        // Imágenes adicionales - Probar diferentes ubicaciones posibles
        console.log('\nProcesando imágenes adicionales:');
        // Primero probamos ctx.request.files que es donde normalmente Koa almacena los archivos
        if (ctx.request.files && ctx.request.files.additionalImages) {
          try {
            console.log('Encontradas imágenes adicionales en ctx.request.files.additionalImages');
            // Normalizar a array
            const imagesToUpload = Array.isArray(ctx.request.files.additionalImages)
              ? ctx.request.files.additionalImages
              : [ctx.request.files.additionalImages];
              
            console.log(`Procesando ${imagesToUpload.length} imágenes adicionales desde ctx.request.files`);
            console.log('Información de la primera imagen:', 
              imagesToUpload[0] ? 
              JSON.stringify({
                name: imagesToUpload[0]['name'] || imagesToUpload[0]['path'] || 'sin nombre',
                size: imagesToUpload[0]['size'] || 0,
                type: imagesToUpload[0]['type'] || imagesToUpload[0]['mimetype'] || 'desconocido'
              }, null, 2) : 'no disponible');
              
            if (imagesToUpload.length > 0) {
              const uploadedImages = await strapi.plugins.upload.services.upload.upload({
                data: {},
                files: imagesToUpload.slice(0, 5) // Máximo 5 imágenes
              });
              
              additionalImagesIds = uploadedImages.map(img => img.id);
              console.log(`${uploadedImages.length} nuevas imágenes adicionales subidas desde ctx.request.files:`, additionalImagesIds);
            }
          } catch (uploadError) {
            console.error('Error al subir imágenes adicionales desde ctx.request.files:', uploadError);
          }
        } else if (files && files.additionalImages) {
          try {
            console.log('Encontradas imágenes adicionales en files.additionalImages');
            // Normalizar a array
            const imagesToUpload = Array.isArray(files.additionalImages)
              ? files.additionalImages
              : [files.additionalImages];
              
            console.log(`Procesando ${imagesToUpload.length} imágenes adicionales`);
            console.log('Información de la primera imagen:', 
              imagesToUpload[0] ? 
              JSON.stringify({
                name: imagesToUpload[0]['name'] || imagesToUpload[0]['path'] || 'sin nombre',
                size: imagesToUpload[0]['size'] || 0,
                type: imagesToUpload[0]['type'] || imagesToUpload[0]['mimetype'] || 'desconocido'
              }, null, 2) : 'no disponible');
              
            if (imagesToUpload.length > 0) {
              const uploadedImages = await strapi.plugins.upload.services.upload.upload({
                data: {},
                files: imagesToUpload.slice(0, 5) // Máximo 5 imágenes
              });
              
              additionalImagesIds = uploadedImages.map(img => img.id);
              console.log(`${uploadedImages.length} nuevas imágenes adicionales subidas:`, additionalImagesIds);
            }
          } catch (uploadError) {
            console.error('Error al subir imágenes adicionales:', uploadError);
          }
        } else {
          console.log('No se encontraron imágenes adicionales');
        }
      } else {
        console.log('Procesando datos JSON (sin archivos)...');
        noticiaData = ctx.request.body || {};
      }
      
      // Extraer datos principales
      console.log('\n[FASE 2] Procesando datos de la noticia...');
      const { title, content, summary, pais, selectedTags } = noticiaData;
      
      // Verificaciones básicas
      if (!title || !content) {
        console.error('Error: Faltan datos requeridos (título o contenido)');
        return ctx.badRequest('Título y contenido son obligatorios');
      }
      
      console.log('Datos básicos extraídos:');
      console.log(`- Título: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`);
      console.log(`- Contenido: ${content ? content.length : 0} caracteres`);
      console.log(`- Resumen: ${summary ? summary.length : 0} caracteres`);
      console.log(`- País: ${pais || 'chile'}`);
      
      // Generar slug
      const slug = slugify(title, { lower: true, strict: true });
      console.log(`- Slug generado: "${slug}"`);
      
      // Configuración de publicación
      const isDraft = noticiaData.draft === 'true';
      const isPublish = noticiaData.publish === 'true';
      const publishedAt = isPublish ? new Date() : null;
      
      console.log('Configuración de publicación:');
      console.log(`- draft=${isDraft}, publish=${isPublish}`);
      console.log(`- publishedAt: ${publishedAt ? publishedAt.toISOString() : 'null'}`);
      
      // Manejar tags
      console.log('\nProcesando etiquetas:');
      console.log('- selectedTags en el formulario:', selectedTags);
      let tagIds = [];
      if (selectedTags) {
        // Los tags pueden venir como array o como valor único
        tagIds = Array.isArray(selectedTags) 
          ? selectedTags
          : [selectedTags];
        
        console.log(`- Tags seleccionados (${tagIds.length}):`, tagIds);
      } else {
        console.log('- No se recibieron tags seleccionados');
      }
      
      // ===== Fase 3: Crear la noticia =====
      console.log('\n[FASE 3] Creando noticia en la base de datos...');
      
      // Datos básicos para la nueva noticia
      const createData = {
        title,
        slug,
        content,
        summary: summary || null,
        pais: pais || 'chile',
        publishedAt,
        sourceName: noticiaData.sourceName || 'Corredor Biocenico',
        articleType: noticiaData.articleType || 'regular',
        manualCreation: true
      } as any;
      
      // Añadir relaciones si hay valores
      if (tagIds.length > 0) {
        createData.tags = tagIds;
        console.log(`Añadiendo ${tagIds.length} tags:`, tagIds);
      }
      
      if (featuredImageId) {
        createData.featuredImage = featuredImageId;
        console.log(`Añadiendo imagen destacada: ${featuredImageId}`);
      }
      
      if (additionalImagesIds.length > 0) {
        createData.additionalImages = additionalImagesIds;
        console.log(`Añadiendo ${additionalImagesIds.length} imágenes adicionales:`, additionalImagesIds);
      }
      
      console.log('Datos completos para crear:', JSON.stringify(createData, null, 2));
      
      try {
        console.log('Enviando creación a la base de datos...');
        const newNoticia = await strapi.db.query('api::noticia.noticia').create({
          data: createData
        });
        
        console.log(`Noticia creada exitosamente con ID: ${newNoticia.id}`);
        const elapsedTime = Date.now() - startTime;
        console.log(`Tiempo total de procesamiento: ${(elapsedTime / 1000).toFixed(2)} segundos`);
        console.log(`=== CREANDO NOTICIA: FIN ===\n`);
        
        return ctx.redirect(`/api/noticias/listar?success=true&message=Noticia creada correctamente`);
      } catch (createError) {
        console.error('Error al crear la noticia en la base de datos:', createError);
        return ctx.redirect('/api/noticias/crear?error=' + encodeURIComponent('Error al guardar la noticia en la base de datos'));
      }
    } catch (error) {
      console.error('Error al crear noticia:', error);
      return ctx.redirect('/api/noticias/crear?error=' + encodeURIComponent('No se pudo crear la noticia. Inténtalo de nuevo.'));
    }
  },
  
  // Método para procesar la edición de una noticia
  async editarNoticia(ctx) {
    const startTime = Date.now();
    console.log(`\n=== EDITANDO NOTICIA: INICIO (${new Date().toISOString()}) ===`);
    console.log(`Información de la solicitud: ${ctx.method} ${ctx.url}`);
    console.log(`Content-Type: ${ctx.request.headers['content-type']}`);
    console.log(`User-Agent: ${ctx.request.headers['user-agent']}`);
    
    try {
      const { id } = ctx.params;
      
      if (!id) {
        console.log('Error: No se proporcionó ID');
        return ctx.badRequest('Se requiere un ID de noticia');
      }
      
      console.log(`\n=== EDITANDO NOTICIA ID ${id}: INICIO ===`);
      
      // ===== Fase 1: Verificar que la noticia existe =====
      console.log('\n[FASE 1] Verificando existencia de la noticia...');
      let existingNoticia;
      try {
        // Usamos strapi.db.query directamente para evitar problemas con 'draft/publish'
        existingNoticia = await strapi.db.query('api::noticia.noticia').findOne({
          where: { id },
          populate: ['tags', 'featuredImage', 'additionalImages']
        });
        
        if (!existingNoticia) {
          console.error(`La noticia con ID ${id} no existe en la base de datos`);
          return ctx.notFound('Noticia no encontrada');
        }
        
        console.log('Noticia encontrada:', {
          id: existingNoticia.id,
          title: existingNoticia.title,
          publishedAt: existingNoticia.publishedAt ? 'publicada' : 'borrador',
          tags: existingNoticia.tags ? existingNoticia.tags.length : 0,
          tagsIds: existingNoticia.tags ? existingNoticia.tags.map(t => t.id).join(', ') : 'ninguno',
          featuredImage: existingNoticia.featuredImage ? existingNoticia.featuredImage.id : null,
          additionalImages: existingNoticia.additionalImages ? existingNoticia.additionalImages.map(img => img.id) : []
        });
      } catch (findError) {
        console.error(`Error al buscar la noticia con ID ${id}:`, findError);
        return ctx.redirect('/api/noticias/listar?error=' + encodeURIComponent('No se pudo encontrar la noticia para editar'));
      }
      
      // ===== Fase 2: Procesar datos del formulario =====
      console.log('\n[FASE 2] Procesando datos del formulario...');
      console.log('Tipo de contenido recibido:', ctx.request.type);
      console.log('Headers:', ctx.request.headers['content-type']);
      
      // Parsear body y extraer datos básicos
      const formBody = ctx.request.body || {};
      console.log('Contenido del body:', Object.keys(formBody));
      
      // Extraer datos de la solicitud
      const title = formBody.title || existingNoticia.title;
      const content = formBody.content || existingNoticia.content;
      const summary = formBody.summary || existingNoticia.summary;
      const pais = formBody.pais || existingNoticia.pais || 'chile';
      
      console.log('Datos básicos extraídos:');
      console.log(`- Título: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`);
      console.log(`- Contenido: ${content.length} caracteres`);
      console.log(`- Resumen: ${summary ? summary.length : 0} caracteres`);
      console.log(`- País: ${pais}`);
      
      // Manejar configuración de publicación
      const isDraft = formBody.draft === 'true';
      const isPublish = formBody.publish === 'true';
      
      console.log('Configuración de publicación:');
      console.log(`- draft=${isDraft}, publish=${isPublish}`);
      console.log(`- Estado actual: ${existingNoticia.publishedAt ? 'publicado' : 'borrador'}`);
      
      // Mantener el estado de publicación actual si no se especifica lo contrario
      let publishedAt = existingNoticia.publishedAt;
      if (isPublish && !existingNoticia.publishedAt) {
        // Si se solicita publicar y estaba en borrador, establecer la fecha actual
        publishedAt = new Date();
        console.log(`Cambiando estado a publicado con fecha: ${publishedAt}`);
      } else if (isDraft && existingNoticia.publishedAt) {
        // Si se solicita guardar como borrador y estaba publicado, establecer null
        publishedAt = null;
        console.log(`Cambiando estado a borrador (publishedAt = null)`);
      }
      
      // Manejar tags
      console.log('\nProcesando etiquetas:');
      console.log('- selectedTags en el formulario:', formBody.selectedTags);
      let tagIds = [];
      if (formBody.selectedTags) {
        // Los tags pueden venir como array o como valor único
        tagIds = Array.isArray(formBody.selectedTags) 
          ? formBody.selectedTags
          : [formBody.selectedTags];
        
        console.log(`- Tags seleccionados (${tagIds.length}):`, tagIds);
      } else {
        console.log('- No se recibieron tags seleccionados');
      }
      
      // Generar slug si el título cambió
      let slug = existingNoticia.slug;
      if (title !== existingNoticia.title) {
        slug = slugify(title, { lower: true, strict: true });
        console.log(`Nuevo slug generado: "${slug}"`);
      }
      
      // ===== Fase 3: Procesar imágenes =====
      console.log('\n[FASE 3] Procesando imágenes...');
      let featuredImageId = null;
      let additionalImagesIds = [];
      
      if (ctx.is('multipart')) {
        console.log('Procesando archivos multipart...');
        console.log('Profundidad del body:', JSON.stringify(Object.keys(ctx.request.body)));
        
        // Intenta obtener la estructura completa sin circular references
        try {
          const safeBody = {};
          Object.keys(ctx.request.body).forEach(key => {
            if (key === 'files') {
              safeBody[key] = 'objeto de archivos (no serializable)';
            } else {
              safeBody[key] = ctx.request.body[key];
            }
          });
          console.log('Estructura simplificada del body:', JSON.stringify(safeBody, null, 2));
        } catch (jsonError) {
          console.log('No se pudo serializar el body completo:', jsonError.message);
        }
        
        // En algunos entornos, los archivos pueden estar en diferentes ubicaciones
        const bodyFiles = ctx.request.body.files || {};
        const formFiles = formBody.files || {};
        const files = bodyFiles || formFiles;
        
        console.log('Estructura de files disponible en:', Object.keys(ctx.request.body).includes('files') ? 'ctx.request.body.files' : 
                                                          (formBody.files ? 'formBody.files' : 'ninguno'));
        console.log('Estructura de archivos:', files ? Object.keys(files) : 'no disponible');
        
        // Detallar todas las posibles ubicaciones de los archivos
        try {
          if (ctx.request.files) {
            console.log('Archivos en ctx.request.files:', Object.keys(ctx.request.files));
            
            // Agregamos logs más detallados sobre las imágenes adicionales en ctx.request.files
            if (ctx.request.files.additionalImages) {
              console.log('Encontradas imágenes adicionales en ctx.request.files.additionalImages');
              const addImages = ctx.request.files.additionalImages;
              console.log('Tipo de additionalImages:', typeof addImages);
              console.log('Es array:', Array.isArray(addImages));
              console.log('Contiene:', Array.isArray(addImages) ? addImages.length : '1 archivo');
            }
          }
          if (ctx.request.body.files) {
            console.log('Archivos en ctx.request.body.files:', Object.keys(ctx.request.body.files));
          }
          if (formBody.files) {
            console.log('Archivos en formBody.files:', Object.keys(formBody.files));
          }
        } catch (e) {
          console.log('Error al listar archivos:', e.message);
        }
        
        // Imagen destacada - Probar diferentes ubicaciones posibles
        console.log('\nProcesando imagen destacada:');
        if (ctx.request.files && ctx.request.files.featuredImage) {
          try {
            console.log('Encontrada imagen destacada en ctx.request.files.featuredImage');
            // Usar any para evitar errores de tipado con propiedades como name, size, etc.
            const featuredFile = ctx.request.files.featuredImage as any;
            
            // Mostrar más información para diagnóstico
            console.log('Detalles completos de la imagen destacada:', JSON.stringify({
              tipo: typeof featuredFile,
              esArray: Array.isArray(featuredFile),
              keys: Object.keys(featuredFile),
              nombre: featuredFile.name,
              path: featuredFile.path,
              tipoMime: featuredFile.type || featuredFile.mimetype,
              tamaño: featuredFile.size
            }, null, 2));
            
            // Verificar si el archivo es válido - lógica simplificada
            // No requerimos que el nombre exista ya que podemos asignarlo
            const isValidFile = featuredFile && featuredFile.size > 0;
                                
            if (isValidFile) {
              console.log('Archivo válido detectado');
              
              // Asignar un nombre si no tiene o si es inválido
              if (!featuredFile.name || featuredFile.name === 'sin nombre' || featuredFile.name.trim() === '') {
                const extension = (featuredFile.type || featuredFile.mimetype || '').includes('png') ? 'png' : 
                                 (featuredFile.type || featuredFile.mimetype || '').includes('gif') ? 'gif' : 'jpg';
                featuredFile.name = `imagen_destacada_${Date.now()}.${extension}`;
                console.log(`Asignando nombre al archivo destacado: ${featuredFile.name}`);
              }
              
              // Asegurar que tenemos un tipo MIME correcto
              if (!featuredFile.type && !featuredFile.mimetype) {
                featuredFile.type = 'image/jpeg';
                console.log('Asignando tipo MIME predeterminado: image/jpeg');
              }
              
              console.log('Información final de la imagen destacada antes de subir:', 
                JSON.stringify({
                  name: featuredFile.name,
                  size: featuredFile.size,
                  type: featuredFile.type || featuredFile.mimetype
                }, null, 2));
              
              try {
                const uploadedImage = await strapi.plugins.upload.services.upload.upload({
                  data: {},
                  files: featuredFile
                });
                
                featuredImageId = uploadedImage[0].id;
                console.log(`Nueva imagen destacada subida con ID: ${featuredImageId}`);
              } catch (innerError) {
                console.error('Error específico al subir la imagen:', innerError);
                console.log('Intentando método alternativo de carga...');
                
                // Intentar con un método alternativo
                const alternativeUpload = await strapi.plugins.upload.services.upload.upload({
                  data: {},
                  files: {
                    path: featuredFile.path || '',
                    name: featuredFile.name || `imagen_alt_${Date.now()}.jpg`,
                    type: featuredFile.type || featuredFile.mimetype || 'image/jpeg',
                    size: featuredFile.size || 0
                  }
                });
                
                featuredImageId = alternativeUpload[0].id;
                console.log(`Nueva imagen destacada subida con método alternativo, ID: ${featuredImageId}`);
              }
            } else {
              console.log('Se detectó un archivo de imagen destacada pero parece estar vacío o ser inválido');
              console.log('Información del archivo problemático:', JSON.stringify({
                nombre: featuredFile.name || 'sin nombre',
                ruta: featuredFile.path || 'sin ruta',
                tamaño: featuredFile.size || 0,
                tipo: featuredFile.type || featuredFile.mimetype || 'desconocido'
              }, null, 2));
              
              // Si el archivo está presente pero el tamaño es 0, intentar con un enfoque alternativo
              if (featuredFile && featuredFile.path && (!featuredFile.size || featuredFile.size === 0)) {
                console.log('Intentando determinar el tamaño del archivo por otros medios...');
                try {
                  const fs = require('fs');
                  if (fs.existsSync(featuredFile.path)) {
                    const stats = fs.statSync(featuredFile.path);
                    console.log(`Tamaño real del archivo según fs: ${stats.size} bytes`);
                    
                    if (stats.size > 0) {
                      console.log('El archivo tiene contenido, intentando subirlo...');
                      featuredFile.size = stats.size;
                      
                      const uploadedImage = await strapi.plugins.upload.services.upload.upload({
                        data: {},
                        files: {
                          path: featuredFile.path,
                          name: `imagen_recuperada_${Date.now()}.jpg`,
                          type: 'image/jpeg',
                          size: stats.size
                        }
                      });
                      
                      featuredImageId = uploadedImage[0].id;
                      console.log(`Imagen destacada recuperada y subida con ID: ${featuredImageId}`);
                    }
                  }
                } catch (fsError) {
                  console.error('Error al intentar recuperar el archivo:', fsError);
                }
              }
              
              // Si todos los intentos fallan, mantener la imagen existente
              if (!featuredImageId) {
                featuredImageId = existingNoticia.featuredImage?.id || null;
                console.log('Manteniendo imagen destacada existente:', featuredImageId);
              }
            }
          } catch (uploadError) {
            console.error('Error al subir imagen destacada:', uploadError);
            // Mantener la imagen existente en caso de error
            featuredImageId = existingNoticia.featuredImage?.id || null;
            console.log('Manteniendo imagen destacada existente debido a error:', featuredImageId);
          }
        } else {
          // Si no hay nueva imagen, mantener la existente
          featuredImageId = existingNoticia.featuredImage?.id || null;
          console.log('No se encontró nueva imagen destacada, manteniendo existente:', featuredImageId);
        }
        
        // Imágenes adicionales - Probar diferentes ubicaciones posibles
        console.log('\nProcesando imágenes adicionales:');
        // Primero probamos ctx.request.files que es donde normalmente Koa almacena los archivos
        if (ctx.request.files && ctx.request.files.additionalImages) {
          try {
            console.log('Encontradas imágenes adicionales en ctx.request.files.additionalImages');
            // Normalizar a array
            const additionalFiles = Array.isArray(ctx.request.files.additionalImages)
              ? ctx.request.files.additionalImages
              : [ctx.request.files.additionalImages];
              
            console.log(`Procesando ${additionalFiles.length} imágenes adicionales desde ctx.request.files`);
            
            // Filtrar solo los archivos válidos (no vacíos)
            const validFiles = additionalFiles.filter(file => 
              file && (file['size'] || 0) > 0
            );
            
            if (validFiles.length > 0) {
              console.log(`${validFiles.length} archivos válidos de ${additionalFiles.length} totales`);
              
              // Asegurarse de que todos los archivos tengan nombres
              validFiles.forEach((file, index) => {
                if (!file['name'] || file['name'] === 'sin nombre') {
                  file['name'] = `imagen_adicional_${Date.now()}_${index}.jpg`;
                  console.log(`Asignando nombre al archivo ${index}: ${file['name']}`);
                }
              });
              
              console.log('Información del primer archivo válido:', 
                validFiles[0] ? 
                JSON.stringify({
                  name: validFiles[0]['name'] || validFiles[0]['path'] || 'archivo',
                  size: validFiles[0]['size'] || 0,
                  type: validFiles[0]['type'] || validFiles[0]['mimetype'] || 'application/octet-stream'
                }, null, 2) : 'no disponible');
                
              if (validFiles.length > 0) {
                const uploadedImages = await strapi.plugins.upload.services.upload.upload({
                  data: {},
                  files: validFiles.slice(0, 5) // Máximo 5 imágenes
                });
                
                additionalImagesIds = uploadedImages.map(img => img.id);
                console.log(`${uploadedImages.length} nuevas imágenes adicionales subidas desde ctx.request.files:`, additionalImagesIds);
              }
            } else {
              console.log('No se encontraron archivos válidos, manteniendo imágenes adicionales existentes');
              additionalImagesIds = existingNoticia.additionalImages?.map(img => img.id) || [];
            }
          } catch (uploadError) {
            console.error('Error al subir imágenes adicionales desde ctx.request.files:', uploadError);
            // Mantener las imágenes existentes en caso de error
            additionalImagesIds = existingNoticia.additionalImages?.map(img => img.id) || [];
          }
        } else if (files && files.additionalImages) {
          try {
            console.log('Encontradas imágenes adicionales en files.additionalImages');
            // Normalizar a array
            const imagesToUpload = Array.isArray(files.additionalImages)
              ? files.additionalImages
              : [files.additionalImages];
              
            console.log(`Procesando ${imagesToUpload.length} imágenes adicionales`);
            console.log('Información de la primera imagen:', 
              imagesToUpload[0] ? 
              JSON.stringify({
                name: imagesToUpload[0]['name'] || imagesToUpload[0]['path'] || 'sin nombre',
                size: imagesToUpload[0]['size'] || 0,
                type: imagesToUpload[0]['type'] || imagesToUpload[0]['mimetype'] || 'desconocido'
              }, null, 2) : 'no disponible');
              
            if (imagesToUpload.length > 0) {
              const uploadedImages = await strapi.plugins.upload.services.upload.upload({
                data: {},
                files: imagesToUpload.slice(0, 5) // Máximo 5 imágenes
              });
              
              additionalImagesIds = uploadedImages.map(img => img.id);
              console.log(`${uploadedImages.length} nuevas imágenes adicionales subidas:`, additionalImagesIds);
            }
          } catch (uploadError) {
            console.error('Error al subir imágenes adicionales:', uploadError);
          }
        } else {
          // Si no hay nuevas imágenes, mantener las existentes
          additionalImagesIds = existingNoticia.additionalImages?.map(img => img.id) || [];
          console.log('No se encontraron nuevas imágenes adicionales, manteniendo existentes:', additionalImagesIds.length);
        }
      } else {
        console.log('No es una solicitud multipart, omitiendo procesamiento de imágenes');
        // Mantener imágenes existentes
        featuredImageId = existingNoticia.featuredImage?.id || null;
        additionalImagesIds = existingNoticia.additionalImages?.map(img => img.id) || [];
      }
      
      // ===== Fase 4: Actualizar la noticia =====
      console.log('\n[FASE 4] Actualizando noticia en la base de datos...');
      const updateData = {
        title,
        content,
        summary,
        slug,
        pais,
        publishedAt
      } as any;
      
      // Añadir relaciones solo si hay valores
      if (tagIds.length > 0) {
        updateData.tags = tagIds;
        console.log(`Actualizando con ${tagIds.length} tags:`, tagIds);
      } else {
        // Si no hay tags seleccionados, asignar array vacío
        updateData.tags = [];
        console.log('Limpiando todos los tags');
      }
      
      if (featuredImageId) {
        updateData.featuredImage = featuredImageId;
        console.log(`Actualizando imagen destacada: ${featuredImageId}`);
      }
      
      if (additionalImagesIds.length > 0) {
        updateData.additionalImages = additionalImagesIds;
        console.log(`Actualizando ${additionalImagesIds.length} imágenes adicionales:`, additionalImagesIds);
      }
      
      console.log('Datos completos a actualizar:', JSON.stringify(updateData, null, 2));
      
      try {
        console.log('Enviando actualización a la base de datos...');
        // Actualizar directamente usando db.query para evitar problemas con draft/publish
        const updatedNoticia = await strapi.db.query('api::noticia.noticia').update({
          where: { id },
          data: updateData
        });
        
        console.log(`Noticia actualizada exitosamente con ID: ${updatedNoticia.id}`);
        const elapsedTime = Date.now() - startTime;
        console.log(`Tiempo total de procesamiento: ${(elapsedTime / 1000).toFixed(2)} segundos`);
        console.log(`=== EDITANDO NOTICIA ID ${id}: FIN ===\n`);
        
        return ctx.redirect(`/api/noticias/listar?success=true&message=Noticia actualizada correctamente`);
      } catch (updateError) {
        console.error('Error al actualizar la noticia:', updateError);
        return ctx.redirect(`/api/noticias/editar/${id}?error=` + encodeURIComponent('Error al guardar los cambios en la base de datos'));
      }
    } catch (error) {
      console.error('Error al editar noticia:', error);
      return ctx.redirect(`/api/noticias/editar/${ctx.params.id}?error=` + encodeURIComponent('No se pudo editar la noticia. Inténtalo de nuevo.'));
    }
  },
  async eliminarNoticia(ctx) {
    try {
      const { id } = ctx.params;
      
      if (!id) {
        return ctx.badRequest('ID de noticia requerido');
      }

      const noticia = await strapi.db.query('api::noticia.noticia').delete({
        where: { id }
      });

      if (!noticia) {
        return ctx.notFound('Noticia no encontrada');
      }

      console.log(`Noticia eliminada: ${id}`);
      return ctx.redirect('/api/noticias/listar?success=Noticia eliminada correctamente');
      
    } catch (error) {
      console.error('Error al eliminar noticia:', error);
      return ctx.redirect('/api/noticias/listar?error=Error al eliminar la noticia');
    }
  },
  // Método para ver una noticia individual
  /**
   * Muestra una noticia individual por su ID
   * 
   * Esta ruta es esencial para el sistema de newsletter, ya que los artículos
   * creados manualmente dirigen a esta URL cuando el usuario hace clic en ellos.
   *
   * ⚠️ IMPORTANTE PARA PRODUCCIÓN:
   * 1. Asegúrate de configurar los permisos correctamente en Strapi
   *    (Settings → Roles → Public → Permitir verNoticia)
   * 2. En producción, las URLs generadas usarán PUBLIC_URL como base
   *    (configurado en .env)
   */
  async verNoticia(ctx) {
    try {
      const { id } = ctx.params;
      
      if (!id) {
        return ctx.badRequest('Se requiere un ID de noticia');
      }

      // Verificar que la noticia existe
      const noticia = await strapi.db.query('api::noticia.noticia').findOne({
        where: { id: parseInt(id) },
        populate: ['tags', 'featuredImage', 'additionalImages']
      });

      if (!noticia) {
        return ctx.notFound('Noticia no encontrada');
      }

      // Base URL para rutas relativas (útil si las URLs de las imágenes son relativas)
      const baseUrl = process.env.PUBLIC_URL;

      // Devolver siempre en formato JSON
      // Normalizar featuredImage
      let featuredImage = null;
      if (noticia.featuredImage) {
        featuredImage = {
          id: noticia.featuredImage.id,
          name: noticia.featuredImage.name,
          url: noticia.featuredImage.url?.startsWith('/') 
            ? `${baseUrl}${noticia.featuredImage.url}` 
            : noticia.featuredImage.url,
          formats: {}
        };
        
        // Procesar formatos si existen
        if (noticia.featuredImage.formats) {
          const formats = noticia.featuredImage.formats;
          Object.keys(formats).forEach(formatKey => { // Renombrado 'format' a 'formatKey' para evitar conflicto de nombres
            if (formats[formatKey] && formats[formatKey].url) {
              featuredImage.formats[formatKey] = {
                url: formats[formatKey].url?.startsWith('/') 
                  ? `${baseUrl}${formats[formatKey].url}` 
                  : formats[formatKey].url,
                width: formats[formatKey].width,
                height: formats[formatKey].height
              };
            }
          });
        }
      }
      
      // Normalizar additionalImages
      const additionalImages = [];
      if (noticia.additionalImages && Array.isArray(noticia.additionalImages)) {
        for (const img of noticia.additionalImages) {
          if (!img) continue;
          
          const processedImg = {
            id: img.id,
            name: img.name,
            url: img.url?.startsWith('/') 
              ? `${baseUrl}${img.url}` 
              : img.url,
            formats: {}
          };
          
          if (img.formats) {
            const formats = img.formats;
            Object.keys(formats).forEach(formatKey => { // Renombrado 'format' a 'formatKey'
              if (formats[formatKey] && formats[formatKey].url) {
                processedImg.formats[formatKey] = {
                  url: formats[formatKey].url?.startsWith('/') 
                    ? `${baseUrl}${formats[formatKey].url}` 
                    : formats[formatKey].url,
                  width: formats[formatKey].width,
                  height: formats[formatKey].height
                };
              }
            });
          }
          
          additionalImages.push(processedImg);
        }
      }

      // Devolver la noticia y sus imágenes en formato JSON
      // ctx.body = { // Asignar directamente al return o a ctx.send para claridad
      return {
        id: noticia.id,
        title: noticia.title,
        slug: noticia.slug,
        content: noticia.content,
        summary: noticia.summary,
        publishedAt: noticia.publishedAt,
        articleDate: noticia.articleDate,
        pais: noticia.pais,
        sourceName: noticia.sourceName,
        sourceUrl: noticia.sourceUrl,
        tags: noticia.tags,
        featuredImage,
        additionalImages
      };
      // La sección de HTML ha sido eliminada.

    } catch (error) {
      console.error('Error al mostrar noticia:', error);
      ctx.internalServerError('Error al mostrar la noticia');
    }
  },

  /**
   * Método combinado que realiza búsqueda tanto en RSS como en CSE
   * 1. Primero busca en RSS y guarda artículos completos o mínimos
   * 2. Luego busca en CSE y elimina duplicados
   * 3. Extrae y procesa el contenido de los enlaces
   * 4. Guarda los artículos en la base de datos
   */
  async findNewsCombined(ctx) {
    try {
      logger.info('=== INICIANDO BÚSQUEDA COMBINADA RSS + CSE ===');
      
      // Obtener parámetros
      const searchTerms = typeof ctx.query.terms === 'string'
        ? ctx.query.terms.split(',').map(t => t.trim())
        : ["Corredor Bioceánico", "Corredor Bioceánico Capricornio", "Rota Bioceânica"];
        
      const country = ctx.query.country as string;
      
      // Estadísticas
      const stats = {
        total: { found: 0, processed: 0, saved: 0, savedMinimal: 0, duplicated: 0, failed: 0 },
        rss: { found: 0, resolved: 0, minimal: 0 },
        cse: { found: 0, minimal: 0 }
      };
      
      // 1. BÚSQUEDA VÍA RSS
      logger.info('=== FASE 1: BÚSQUEDA RSS ===');
      const rssResults = await strapi.service('api::noticia.noticia-scraper').findGoogleNewsRSS(searchTerms);
      stats.rss.found = rssResults.length;
      stats.rss.resolved = rssResults.filter(item => item.link && !item.link.includes('news.google.com')).length;
      stats.rss.minimal = rssResults.filter(item => item.link && item.link.includes('news.google.com')).length;
      
      // Guardar enlaces ya procesados
      const processedUrls = new Map();
      
      // Artículos guardados
      const savedArticles = [];
      
      // Procesar resultados RSS
      logger.info(`Procesando ${rssResults.length} resultados de RSS...`);
      for (const item of rssResults) {
        try {
          stats.total.processed++;
          
          // Verificar si ya existe en la base de datos
          const existingResults = await strapi.entityService.findMany('api::noticia.noticia', {
            filters: { sourceUrl: item.link }
          });

          if (existingResults && Array.isArray(existingResults) && existingResults.length > 0) {
            logger.info(`Artículo ya existe: ${item.link}`);
            stats.total.duplicated++;
            continue;
          }
          
          // Marcar como procesado
          processedUrls.set(item.link, 'rss');
          
          // Verificar si es una URL de Google News sin resolver o una URL resuelta
          const isGoogleNewsUrl = item.link.includes('news.google.com');
          
          if (isGoogleNewsUrl) {
            // CASO 1: URL no resuelta - guardar versión mínima
            logger.info(`Guardando versión mínima para URL no resuelta: ${item.link}`);
            
            // No aplicar filtro de relevancia para RSS
            // Crear artículo mínimo
            const minimalArticle = await strapi.entityService.create('api::noticia.noticia', {
              data: {
                title: item.title,
                slug: item.title.toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, ''),
                content: `<p>${item.title}</p><p><a href="${item.link}" target="_blank">Ver artículo original</a></p>`,
                summary: item.title.substring(0, 150),
                sourceUrl: item.link,
                sourceName: item.sourceName || 'Google News',
                publishedAt: new Date(),
                articleDate: item.publishedDate || new Date(),
                pais: 'mundo',
                articleType: 'minimal',
                relevanceScore: 90 // Asignamos score de 90 a noticias RSS
              }
            });
            
            savedArticles.push(minimalArticle);
            stats.total.savedMinimal++;
            stats.total.saved++;
            logger.info(`⚠️ Artículo mínimo guardado (RSS): ${item.title}`);
          } else {
            // CASO 2: URL resuelta - intentar extraer contenido completo
            logger.info(`Extrayendo contenido completo para: ${item.link}`);
            
            // Extraer datos del artículo sin aplicar filtros de validación para RSS
            const articleData = await strapi.service('api::noticia.noticia-scraper').extractArticleData(item.link, {
              title: item.title,
              source: item.sourceName,
              publishedTime: item.publishedDate,
              skipValidation: true // Indicamos que se debe omitir la validación
            });
            
            if (articleData) {
              // Guardar artículo completo
              // Preparar los tags
              const tagIds = await strapi.service('api::noticia.noticia-scraper').handleTags(articleData.tags);
              
              const savedArticle = await strapi.entityService.create('api::noticia.noticia', {
                data: {
                  title: articleData.title,
                  slug: articleData.title.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, ''),
                  content: articleData.content
                    .split('\n')
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
                    .map(p => `<p>${p}</p>`)
                    .join('\n'),
                  summary: articleData.summary || '',
                  mainImage: articleData.mainImage || null,
                  sourceUrl: articleData.sourceUrl,
                  sourceName: articleData.sourceName,
                  publishedAt: new Date(),
                  articleDate: articleData.publishedAt,
                  pais: articleData.pais,
                  tags: tagIds,
                  articleType: 'regular'
                }
              });
              
              savedArticles.push(savedArticle);
              stats.total.saved++;
              logger.info(`✅ Artículo completo guardado: ${articleData.title}`);
            } else {
              // Falló la extracción, guardar versión mínima
              logger.info(`No se pudo extraer contenido, guardando mínimo: ${item.link}`);
              
              // No verificamos relevancia para RSS, creamos directamente el artículo mínimo
              const minimalArticle = await strapi.entityService.create('api::noticia.noticia', {
                data: {
                  title: item.title,
                  slug: item.title.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, ''),
                  content: `<p>${item.title}</p><p><a href="${item.link}" target="_blank">Ver artículo original</a></p>`,
                  summary: item.title.substring(0, 150),
                  sourceUrl: item.link,
                  sourceName: item.sourceName || 'Fuente Externa',
                  publishedAt: new Date(),
                  articleDate: item.publishedDate || new Date(),
                  pais: 'mundo',
                  articleType: 'minimal',
                  relevanceScore: 90 // Asignamos score de 90 a noticias RSS
                }
              });
              
              savedArticles.push(minimalArticle);
              stats.total.savedMinimal++;
              stats.total.saved++;
              logger.info(`⚠️ Artículo mínimo guardado (RSS, extracción fallida): ${item.title}`);
            }
          }
        } catch (error) {
          logger.error(`Error procesando: ${item.link}`, error);
          stats.total.failed++;
        }
      }
      
      // 2. BÚSQUEDA VÍA CSE
      logger.info('=== FASE 2: BÚSQUEDA CSE ===');
      let cseResults = [];
      for (const term of searchTerms) {
        const termResults = await strapi.service('api::noticia.noticia-scraper').searchNews(term, country);
        cseResults = [...cseResults, ...termResults];
      }
      stats.cse.found = cseResults.length;
      
      // Filtrar duplicados entre RSS y CSE
      const uniqueCseResults = cseResults.filter(item => !processedUrls.has(item.link));
      logger.info(`CSE: ${uniqueCseResults.length} enlaces únicos de ${cseResults.length} encontrados`);
      
      // Procesar resultados CSE
      logger.info(`Procesando ${uniqueCseResults.length} resultados únicos de CSE...`);
      for (const item of uniqueCseResults) {
        try {
          stats.total.processed++;
          
          // Verificar si ya existe en la base de datos
          const existingResults = await strapi.entityService.findMany('api::noticia.noticia', {
            filters: { sourceUrl: item.link }
          });

          if (existingResults && Array.isArray(existingResults) && existingResults.length > 0) {
            logger.info(`Artículo ya existe: ${item.link}`);
            stats.total.duplicated++;
            continue;
          }
          
          // Marcar como procesado
          processedUrls.set(item.link, 'cse');
          
          // Extraer datos del artículo
          const articleData = await strapi.service('api::noticia.noticia-scraper').extractArticleData(item.link, {
            title: item.title,
            source: item.source,
            publishedTime: item.publishedTime
          });
          
          if (articleData) {
            // Guardar artículo completo
            // Preparar los tags
            const tagIds = await strapi.service('api::noticia.noticia-scraper').handleTags(articleData.tags);
            
            const savedArticle = await strapi.entityService.create('api::noticia.noticia', {
              data: {
                title: articleData.title,
                slug: articleData.title.toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, ''),
                content: articleData.content
                  .split('\n')
                  .map(p => p.trim())
                  .filter(p => p.length > 0)
                  .map(p => `<p>${p}</p>`)
                  .join('\n'),
                summary: articleData.summary || '',
                mainImage: articleData.mainImage || null,
                sourceUrl: articleData.sourceUrl,
                sourceName: articleData.sourceName,
                publishedAt: new Date(),
                articleDate: articleData.publishedAt,
                pais: articleData.pais,
                tags: tagIds,
                articleType: 'regular'
              }
            });
            
            savedArticles.push(savedArticle);
            stats.total.saved++;
            logger.info(`✅ Artículo completo guardado (CSE): ${articleData.title}`);
          } else {
            // Falló la extracción, guardar versión mínima
            logger.info(`No se pudo extraer contenido (CSE), guardando mínimo: ${item.link}`);
            
            // Verificar si el título es relevante
            const relevance = strapi.service('api::noticia.noticia-scraper').isRelevantNewsItem(item.title, item.snippet || '');
            
            if (relevance.isRelevant) {
              // Extraer imagen del pagemap si está disponible
              let mainImage = null;
              if (item.pagemap?.cse_image?.[0]?.src) {
                mainImage = item.pagemap.cse_image[0].src;
              } else if (item.pagemap?.metatags?.[0]?.['og:image']) {
                mainImage = item.pagemap.metatags[0]['og:image'];
              } else if (item.pagemap?.metatags?.[0]?.['twitter:image']) {
                mainImage = item.pagemap.metatags[0]['twitter:image'];
              }

              const minimalArticle = await strapi.entityService.create('api::noticia.noticia', {
                data: {
                  title: item.title,
                  slug: item.title.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, ''),
                  content: `<p>${item.snippet || item.title}</p><p><a href="${item.link}" target="_blank">Ver artículo original</a></p>`,
                  summary: item.snippet ? (item.snippet.length > 150 ? item.snippet.substring(0, 147) + '...' : item.snippet) : item.title.substring(0, 150),
                  sourceUrl: item.link,
                  sourceName: item.source,
                  publishedAt: new Date(),
                  articleDate: item.publishedTime ? new Date(item.publishedTime) : new Date(),
                  pais: 'mundo',
                  articleType: 'minimal',
                  mainImage: mainImage, // Añadimos la imagen principal
                  relevanceScore: relevance.score
                }
              });
              
              savedArticles.push(minimalArticle);
              stats.total.savedMinimal++;
              stats.total.saved++;
              stats.cse.minimal++;
              logger.info(`⚠️ Artículo mínimo guardado (CSE, extracción fallida): ${item.title} (Score: ${relevance.score})`);
              logger.info(`   Keywords: ${relevance.matchedKeywords.join(', ')}`);
            } else {
              logger.info(`❌ Artículo CSE no relevante para el Corredor Bioceánico (Score: ${relevance.score}): ${item.title}`);
            }
          }
        } catch (error) {
          logger.error(`Error procesando (CSE): ${item.link}`, error);
          stats.total.failed++;
        }
      }
      
      // Resumen estadístico
      logger.info('=== RESULTADOS DE LA BÚSQUEDA COMBINADA ===');
      logger.info(`Total enlaces encontrados: ${stats.total.found = stats.rss.found + stats.cse.found}`);
      logger.info(`  - RSS: ${stats.rss.found} (resueltos: ${stats.rss.resolved}, mínimos: ${stats.rss.minimal})`);
      logger.info(`  - CSE: ${stats.cse.found} (únicos: ${uniqueCseResults.length}, mínimos: ${stats.cse.minimal})`);
      logger.info(`Artículos procesados: ${stats.total.processed}`);
      logger.info(`  - Guardados: ${stats.total.saved} (completos: ${stats.total.saved - stats.total.savedMinimal}, mínimos: ${stats.total.savedMinimal})`);
      logger.info(`  - Duplicados: ${stats.total.duplicated}`);
      logger.info(`  - Fallidos: ${stats.total.failed}`);
      
      // Preparar respuesta
      const summaryHTML = `
        <h1>Resultados de búsqueda combinada RSS + CSE</h1>
        <p>Fecha: ${new Date().toLocaleString()}</p>
        <p>Términos buscados: ${searchTerms.join(', ')}</p>
        ${country ? `<p>País: ${country.toUpperCase()}</p>` : ''}
        
        <h2>Estadísticas generales</h2>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Fuente</th>
            <th>Enlaces encontrados</th>
            <th>Artículos completos</th>
            <th>Artículos mínimos</th>
          </tr>
          <tr>
            <td>RSS</td>
            <td>${stats.rss.found}</td>
            <td>${stats.rss.resolved}</td>
            <td>${stats.rss.minimal}</td>
          </tr>
          <tr>
            <td>CSE</td>
            <td>${stats.cse.found}</td>
            <td>${stats.cse.found - stats.cse.minimal}</td>
            <td>${stats.cse.minimal}</td>
          </tr>
          <tr>
            <td><strong>TOTAL</strong></td>
            <td>${stats.total.found}</td>
            <td>${stats.total.saved - stats.total.savedMinimal}</td>
            <td>${stats.total.savedMinimal}</td>
          </tr>
        </table>
        
        <h2>Resultados finales</h2>
        <ul>
          <li>Artículos procesados: ${stats.total.processed}</li>
          <li>Artículos guardados: ${stats.total.saved}</li>
          <li>Artículos duplicados: ${stats.total.duplicated}</li>
          <li>Artículos fallidos: ${stats.total.failed}</li>
        </ul>
        
        <h2>Artículos guardados</h2>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Título</th>
            <th>Tipo</th>
            <th>Fuente</th>
            <th>Enlace</th>
          </tr>
          ${savedArticles.map(article => `
            <tr>
              <td>${article.title}</td>
              <td>${article.articleType || 'regular'}</td>
              <td>${article.sourceName || '-'}</td>
              <td><a href="${article.sourceUrl}" target="_blank">Ver artículo</a></td>
            </tr>
          `).join('')}
        </table>
        
        <h2>Detalle por tipo de scraping</h2>
        
        <h3>Artículos con scraping completo (${savedArticles.filter(a => a.articleType === 'regular' || !a.articleType).length})</h3>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Título</th>
            <th>Fuente</th>
            <th>País</th>
            <th>Enlace</th>
          </tr>
          ${savedArticles.filter(a => a.articleType === 'regular' || !a.articleType).map(article => `
            <tr>
              <td>${article.title}</td>
              <td>${article.sourceName || '-'}</td>
              <td>${article.pais || 'mundo'}</td>
              <td><a href="${article.sourceUrl}" target="_blank">Ver artículo</a></td>
            </tr>
          `).join('')}
        </table>
        
        <h3>Artículos con scraping mínimo (${savedArticles.filter(a => a.articleType === 'minimal').length})</h3>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Título</th>
            <th>Fuente</th>
            <th>Puntuación</th>
            <th>Enlace</th>
          </tr>
          ${savedArticles.filter(a => a.articleType === 'minimal').map(article => `
            <tr>
              <td>${article.title}</td>
              <td>${article.sourceName || '-'}</td>
              <td>${article.relevanceScore || 'N/A'}</td>
              <td><a href="${article.sourceUrl}" target="_blank">Ver artículo</a></td>
            </tr>
          `).join('')}
        </table>
        
        <h2>Listado completo de enlaces encontrados</h2>
        
        <h3>Enlaces encontrados por RSS (${rssResults.length})</h3>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Título</th>
            <th>Fuente</th>
            <th>Estado</th>
            <th>URL</th>
          </tr>
          ${rssResults.map(item => `
            <tr>
              <td>${item.title}</td>
              <td>${item.sourceName || '-'}</td>
              <td>${item.link.includes('news.google.com') ? 'No resuelto' : 'Resuelto'}</td>
              <td><a href="${item.link}" target="_blank">${item.link}</a></td>
            </tr>
          `).join('')}
        </table>
        
        <h3>Enlaces encontrados por CSE (${cseResults.length})</h3>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr>
            <th>Título</th>
            <th>Fuente</th>
            <th>URL</th>
          </tr>
          ${cseResults.map(item => `
            <tr>
              <td>${item.title}</td>
              <td>${item.source || '-'}</td>
              <td><a href="${item.link}" target="_blank">${item.link}</a></td>
            </tr>
          `).join('')}
        </table>
        
        <h3>Enlaces en formato para copiar</h3>
        <h4>Enlaces de RSS:</h4>
        <pre style="max-height: 300px; overflow: auto; background: #f5f5f5; padding: 10px; border: 1px solid #ddd;">
RSS_LINKS = [
${rssResults.map(item => `  '${item.link}', // [${item.sourceName || '-'}] ${item.title.substring(0, 50)}...`).join('\n')}
];
        </pre>
        
        <h4>Enlaces de CSE:</h4>
        <pre style="max-height: 300px; overflow: auto; background: #f5f5f5; padding: 10px; border: 1px solid #ddd;">
CSE_LINKS = [
${cseResults.map(item => `  '${item.link}', // [${item.source || '-'}] ${item.title.substring(0, 50)}...`).join('\n')}
];
        </pre>
      `;
      
      // Devolver HTML para visualización en navegador
      ctx.type = 'text/html';
      ctx.body = summaryHTML;
      
      return {
        stats,
        savedArticles
      };
      
    } catch (error) {
      logger.error('Error en búsqueda combinada:', error);
      ctx.status = 500;
      ctx.body = { error: 'Error en búsqueda combinada' };
    }
  }
}))
