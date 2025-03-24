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

      // Filtrar por tags
      if (tags) {
        const tagList = Array.from(new Set(Array.isArray(tags) ? tags : [tags]));
        advancedFilters.$and = tagList.map(tag => ({
          tags: {
            nombre: {
              $eq: tag
            }
          }
        }));
      }

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
  // Método para mostrar el formulario de creación
  async crearNoticiaForm(ctx) {
    try {
      console.log(`\n=== FORMULARIO DE CREACIÓN DE NOTICIA: INICIO (${new Date().toISOString()}) ===`);
      
      // Obtener todas las etiquetas disponibles para el selector
      const availableTags = await strapi.db.query('api::tag.tag').findMany();
      console.log(`Etiquetas disponibles: ${availableTags.length}`);
      
      return ctx.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Crear Nueva Noticia</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: #2c3e50; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input[type="text"], textarea, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
            textarea { min-height: 100px; }
            .tags-container { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px; }
            .tag-option { display: flex; align-items: center; }
            .tag-option input { margin-right: 5px; width: auto; }
            .button-group { display: flex; gap: 15px; margin-top: 20px; }
            button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background-color: #45a049; }
            .image-upload { border: 2px dashed #ccc; padding: 20px; margin-bottom: 20px; text-align: center; background-color: #f8f8f8; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Crear Nueva Noticia</h1>
            <form action="/api/noticias/crear" method="POST" enctype="multipart/form-data">
              <div class="form-group">
                <label for="title">Título *</label>
                <input type="text" id="title" name="title" required>
              </div>
              
              <div class="form-group">
                <label for="content">Contenido *</label>
                <textarea id="content" name="content" required></textarea>
                <div class="word-counter" id="contentCounter">0 palabras</div>
              </div>
              
              <div class="form-group">
                <label for="summary">Resumen</label>
                <textarea id="summary" name="summary" maxlength="500"></textarea>
                <button type="button" id="generateSummary" class="ai-button" disabled>Generar con IA</button>
                <div id="summaryAlert" class="alert-info">
                  Para generar un resumen automático, el contenido debe tener al menos 100 palabras.
                </div>
              </div>
              
              <div class="form-group">
                <label for="pais">País *</label>
                <select id="pais" name="pais" required>
                  <option value="chile">Chile</option>
                  <option value="paraguay">Paraguay</option>
                  <option value="brasil">Brasil</option>
                  <option value="argentina">Argentina</option>
                  <option value="mundo">Mundo</option>
                </select>
              </div>
              
              <!-- Campos ocultos con valores predeterminados -->
              <input type="hidden" id="sourceName" name="sourceName" value="Corredor Biocenico">
              <input type="hidden" id="articleType" name="articleType" value="regular">
              
              <!-- Imagen destacada -->
              <div class="image-upload">
                <h3>Imagen Destacada</h3>
                <input type="file" id="featuredImage" name="featuredImage" accept="image/jpeg, image/png, image/gif">
                <div class="image-upload-info">
                  <p>Formatos aceptados: JPG, PNG, GIF</p>
                  <p>Tamaño máximo: 20 MB</p>
                  <p class="info-text" style="color: #e74c3c;">Si no desea cambiar la imagen, deje este campo vacío</p>
                </div>
              </div>
              
              <!-- Sección para imágenes adicionales -->
              <div class="image-upload">
                <h3>Imágenes Adicionales (máximo 5)</h3>
                <input type="file" id="additionalImages" name="additionalImages" accept="image/jpeg, image/png, image/gif" multiple>
                <div class="image-upload-info">
                  <p>Formatos aceptados: JPG, PNG, GIF</p>
                  <p>Tamaño máximo: 20 MB por imagen</p>
                  <p>Puedes seleccionar hasta 5 imágenes</p>
                  <p class="info-text" style="color: #e74c3c;">Si no desea cambiar las imágenes, deje este campo vacío</p>
                </div>
              </div>
              
              <!-- Selección múltiple de etiquetas usando checkboxes -->
              <div class="form-group">
                <label>Etiquetas</label>
                <div class="tags-container">
                  ${availableTags && availableTags.length ? availableTags.map(tag => `
                    <div class="tag-option">
                      <input type="checkbox" 
                             id="tag-${tag.id}" 
                             name="selectedTags[]" 
                             value="${tag.id}">
                      <label for="tag-${tag.id}">${tag.nombre || tag.name || 'Etiqueta sin nombre'}</label>
                    </div>
                  `).join('') : '<div class="no-tags">No hay etiquetas disponibles</div>'}
                </div>
              </div>
              
              <div class="button-group">
                <button type="submit" name="draft" value="true">Guardar como borrador</button>
                <button type="submit" name="publish" value="true">Publicar ahora</button>
              </div>
            </form>
            
            <div class="back-link">
              <a href="/api/noticias/listar">Volver a la lista de noticias</a>
            </div>
          </div>
          
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              const contentTextarea = document.getElementById('content');
              const summaryButton = document.getElementById('generateSummary');
              const wordCounter = document.getElementById('contentCounter');
              const summaryAlert = document.getElementById('summaryAlert');
              const titleInput = document.getElementById('title');
              
              // Función para contar palabras correctamente
              const countWords = (text) => {
                return text.trim().match(/\S+/g)?.length || 0;
              };

              // Actualizar contador al cargar la página
              const initialText = contentTextarea.value;
              const initialWordCount = countWords(initialText);
              wordCounter.textContent = initialWordCount + ' palabras';
              
              if (initialWordCount >= 100) {
                summaryButton.disabled = false;
                summaryAlert.style.display = 'none';
              }

              contentTextarea.addEventListener('input', function() {
                const text = this.value;
                const wordCount = countWords(text);
                wordCounter.textContent = wordCount + ' palabras';
                
                // Habilitar/deshabilitar botón de IA
                summaryButton.disabled = wordCount < 100;
                summaryAlert.style.display = wordCount < 100 ? 'block' : 'none';
              });
              
              // Botón para generar resumen con IA
              summaryButton.addEventListener('click', async function() {
                const content = contentTextarea.value;
                const title = titleInput.value;
                
                if (!content || content.trim().split(/\\s+/).filter(Boolean).length < 100) {
                  alert('El contenido debe tener al menos 100 palabras para generar un resumen.');
                  return;
                }
                
                try {
                  summaryButton.disabled = true;
                  summaryButton.textContent = 'Generando...';
                  
                  const response = await fetch('/api/noticias/generar-resumen', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content, title })
                  });
                  
                  if (!response.ok) {
                    throw new Error('Error al generar el resumen');
                  }
                  
                  const data = await response.json();
                  document.getElementById('summary').value = data.summary;
                  
                } catch (error) {
                  console.error('Error:', error);
                  alert('No se pudo generar el resumen. Inténtalo de nuevo más tarde.');
                } finally {
                  summaryButton.disabled = false;
                  summaryButton.textContent = 'Generar con IA';
                }
              });
              
              // Validación del formulario
              const form = document.querySelector('form');
              form.addEventListener('submit', function(e) {
                const wordCount = countWords(contentTextarea.value);
                if (wordCount < 50) {
                  e.preventDefault();
                  alert('El contenido debe tener al menos 50 palabras.');
                  return false;
                }
                return true;
              });
            });
          </script>
        </body>
      </html>
    `);
    } catch (error) {
      console.error('Error al crear noticia:', error);
      return ctx.redirect('/api/noticias/crear?error=' + encodeURIComponent('No se pudo crear la noticia. Inténtalo de nuevo.'));
    }
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
  
  // Método para listar noticias manualmente
  async listarNoticiasManual(ctx) {
    try {
      console.log('\n=== LISTADO DE NOTICIAS: INICIO ===');
      
      // Obtener el modo de visualización desde la query
      const { modo = 'all', success, error, id } = ctx.query;
      
      console.log(`Obteniendo noticias en modo: ${modo}`);

      // Definir los filtros según el modo
      let whereClause = {};
      
      if (modo === 'published') {
        console.log('Obteniendo solo noticias publicadas...');
        whereClause = {
          publishedAt: { $notNull: true }
        };
      } else if (modo === 'draft') {
        console.log('Obteniendo solo noticias en borrador...');
        whereClause = {
          publishedAt: { $null: true }
        };
      } else {
        console.log('Obteniendo todas las noticias (publicadas y borradores)...');
        // Sin filtros para mostrar todas
        whereClause = {}; // Explícitamente vacío para asegurar que no hay filtros
      }

      console.log('Filters:', JSON.stringify(whereClause));
      
      // Obtener todas las noticias con los filtros aplicados
      const noticias = await strapi.db.query('api::noticia.noticia').findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        populate: ['tags', 'featuredImage', 'additionalImages']
      });
      
      console.log(`Se encontraron ${noticias.length} noticias con el filtro seleccionado`);
      
      // Contar el total de noticias para el botón "Ver Todas"
      const totalNoticias = await strapi.db.query('api::noticia.noticia').count({});
      console.log(`Total de noticias en la base de datos: ${totalNoticias}`);

      // Crear la respuesta HTML
      const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lista de Noticias</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f9f9f9;
              margin: 0;
              padding: 20px;
            }
            
            .container {
              max-width: 1200px;
              margin: 0 auto;
              background-color: white;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
              padding: 30px;
            }
            
            h1 {
              color: #2c3e50;
              margin-bottom: 30px;
              border-bottom: 2px solid #eee;
              padding-bottom: 15px;
              text-align: center;
            }
            
            .filters {
              display: flex;
              justify-content: center;
              margin-bottom: 30px;
              gap: 15px;
              flex-wrap: wrap;
            }
            
            .filter-button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #f5f5f5;
              color: #333;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-weight: 500;
              text-decoration: none;
              transition: all 0.3s ease;
            }
            
            .filter-button:hover {
              background-color: #e0e0e0;
            }
            
            .filter-button.active {
              background-color: #3498db;
              color: white;
            }
            
            .filter-button.published {
              background-color: #2ecc71;
              color: white;
            }
            
            .filter-button.published:hover {
              background-color: #27ae60;
            }
            
            .filter-button.draft {
              background-color: #e74c3c;
              color: white;
            }
            
            .filter-button.draft:hover {
              background-color: #c0392b;
            }
            
            .filter-button.all {
              background-color: #9b59b6;
              color: white;
            }
            
            .filter-button.all:hover {
              background-color: #8e44ad;
            }
            
            .news-list {
              list-style: none;
              padding: 0;
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
              gap: 30px;
            }
            
            .news-item {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
              padding: 20px;
              transition: transform 0.3s ease;
              position: relative;
              border: 1px solid #eee;
            }
            
            .news-item:hover {
              transform: translateY(-5px);
              box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
            }
            
            .status {
              display: inline-block;
              padding: 5px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            
            .status.published {
              background-color: #e8f5e9;
              color: #2e7d32;
              border: 1px solid #81c784;
            }
            
            .status.draft {
              background-color: #ffebee;
              color: #c62828;
              border: 1px solid #ef9a9a;
            }
            
            .news-meta {
              font-size: 14px;
              color: #666;
              margin-bottom: 15px;
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
            }
            
            .news-meta div {
              background-color: #f5f5f5;
              padding: 3px 8px;
              border-radius: 4px;
            }
            
            .tag-list {
              margin: 15px 0;
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            
            .tag-item {
              background-color: #e3f2fd;
              color: #1976d2;
              font-size: 12px;
              border-radius: 4px;
              padding: 4px 8px;
            }
            
            .news-image {
              max-width: 100%;
              border-radius: 6px;
              margin-top: 10px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .news-gallery {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-top: 10px;
            }
            
            .gallery-image {
              width: 100px;
              height: 100px;
              object-fit: cover;
              border-radius: 5px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .no-results {
              text-align: center;
              padding: 40px 0;
              font-size: 18px;
              color: #999;
            }
            
            h3 {
              margin-top: 0;
              color: #2c3e50;
              font-size: 1.2rem;
              line-height: 1.4;
            }
            
            h4 {
              color: #3498db;
              margin: 15px 0 10px;
              font-size: 0.9rem;
            }
            
            p {
              margin: 10px 0;
              color: #555;
              font-size: 0.9rem;
            }
            
            .create-button {
              display: block;
              width: 200px;
              text-align: center;
              margin: 0 auto 30px;
              padding: 12px 25px;
              background-color: #3498db;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 500;
              transition: background-color 0.3s ease;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .create-button:hover {
              background-color: #2980b9;
            }
            
            .action-buttons {
              margin-top: 20px;
              display: flex;
              gap: 10px;
            }
            
            .edit-button {
              display: inline-block;
              padding: 8px 15px;
              background-color: #ff9800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 500;
              transition: background-color 0.3s ease;
            }
            
            .edit-button:hover {
              background-color: #f57c00;
            }
            
            .publish-button {
              display: inline-block;
              padding: 8px 15px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 500;
              transition: background-color 0.3s ease;
            }
            
            .publish-button:hover {
              background-color: #388E3C;
            }
            
            .unpublish-button {
              display: inline-block;
              padding: 8px 15px;
              background-color: #f44336;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 500;
              transition: background-color 0.3s ease;
            }
            
            .unpublish-button:hover {
              background-color: #d32f2f;
            }

            .delete-button {
              background-color: #e74c3c;
              color: white;
              padding: 8px 15px;
              border-radius: 5px;
              text-decoration: none;
              cursor: pointer;
              border: none;
              font-weight: 500;
              transition: background-color 0.3s ease;
            }

            .delete-button:hover {
              background-color: #c0392b;
            }

            .delete-form {
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Lista de Noticias</h1>
            
            <a href="/api/noticias/crear" class="create-button">Crear Nueva Noticia</a>
            
            <div class="filters">
              <a href="/api/noticias/listar?modo=all" class="filter-button all ${modo === 'all' ? 'active' : ''}">Ver Todas (${totalNoticias})</a>
              <a href="/api/noticias/listar?modo=published" class="filter-button published ${modo === 'published' ? 'active' : ''}">Ver Publicadas</a>
              <a href="/api/noticias/listar?modo=draft" class="filter-button draft ${modo === 'draft' ? 'active' : ''}">Ver Borradores</a>
            </div>
            
            ${noticias.length === 0 ? 
              `<div class="no-results">No se encontraron noticias${modo !== 'all' ? ' con este filtro' : ''}.</div>` : 
              `<ul class="news-list">
                ${noticias.map((noticia: any) => `
                  <li class="news-item">
                    <span class="status ${noticia.publishedAt ? 'published' : 'draft'}">
                      ${noticia.publishedAt ? 'Publicada' : 'Borrador'}
                    </span>
                    <h3>${noticia.title}</h3>
                    <div class="news-meta">
                      <div>ID: ${noticia.id}</div>
                      <div>Creada: ${new Date(noticia.createdAt).toLocaleString('es-ES')}</div>
                      ${noticia.publishedAt 
                        ? `<div>Publicada: ${new Date(noticia.publishedAt).toLocaleString('es-ES')}</div>` 
                        : ''}
                    </div>
                    ${noticia.summary ? `<p>${noticia.summary}</p>` : ''}
                    ${noticia.tags && noticia.tags.length > 0 
                      ? `
                        <div class="tag-list">
                          ${noticia.tags.map((tag: any) => `
                            <span class="tag-item">${tag.name || tag.id}</span>
                          `).join('')}
                        </div>
                      ` 
                      : ''}
                    ${noticia.featuredImage 
                      ? `
                        <div>
                          <h4>Imagen Destacada:</h4>
                          <img src="${noticia.featuredImage.url}" alt="${noticia.title}" class="news-image">
                        </div>
                      ` 
                      : ''}
                    ${noticia.additionalImages && noticia.additionalImages.length > 0 
                      ? `
                        <div>
                          <h4>Imágenes Adicionales (${noticia.additionalImages.length}):</h4>
                          <div class="news-gallery">
                            ${noticia.additionalImages.map((img: any) => `
                              <img src="${img.url}" alt="" class="gallery-image">
                            `).join('')}
                          </div>
                        </div>
                      ` 
                      : ''}
                    
                    <div class="action-buttons">
                      <a href="/api/noticias/editar/${noticia.id}" 
                         class="edit-button">
                        Editar
                      </a>
                      ${!noticia.publishedAt 
                        ? `<a href="/api/noticias/publicar/${noticia.id}" 
                             class="publish-button">
                            Publicar
                          </a>`
                        : `<a href="/api/noticias/despublicar/${noticia.id}"
                             class="unpublish-button">
                            Despublicar
                          </a>`
                      }
                      <form class="delete-form" action="/api/noticias/eliminar/${noticia.id}" method="POST">
                        <button type="submit" class="delete-button" onclick="return confirm('¿Estás seguro de eliminar esta noticia?')">Eliminar</button>
                      </form>
                    </div>
                  </li>
                `).join('')}
              </ul>`
            }
          </div>
        </body>
      </html>
      `;

      return ctx.send(htmlResponse);
    } catch (error) {
      console.error('Error al listar noticias:', error);
      ctx.throw(500, `Error al listar noticias: ${error.message}`);
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
  
  // Método para mostrar el formulario de edición
  async editarNoticiaForm(ctx) {
    try {
      const { id } = ctx.params;
      
      if (!id) {
        return ctx.badRequest('Se requiere un ID de noticia');
      }
      
      console.log(`Cargando formulario de edición para noticia ID: ${id}`);
      
      // Obtener todas las etiquetas disponibles para el selector
      const availableTags = await strapi.db.query('api::tag.tag').findMany();
      console.log(`Etiquetas disponibles: ${availableTags.length}`);
      
      // Obtener la noticia con sus relaciones
      try {
        // Usamos strapi.db.query directamente para evitar problemas con 'draft/publish'
        const noticia = await strapi.db.query('api::noticia.noticia').findOne({
          where: { id },
          populate: ['tags', 'featuredImage', 'additionalImages']
        });
        
        if (!noticia) {
          console.error(`Noticia con ID ${id} no encontrada`);
          return ctx.notFound('Noticia no encontrada');
        }
        
        console.log('Noticia encontrada:', {
          id: noticia.id,
          title: noticia.title,
          publishedAt: noticia.publishedAt,
          tags: noticia.tags ? noticia.tags.length : 0,
          tagsIds: noticia.tags ? noticia.tags.map(t => t.id).join(', ') : 'ninguno'
        });
        
        return ctx.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Editar Noticia</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f8f9fa;
                margin: 0;
                padding: 20px;
              }
              
              .container {
                max-width: 900px;
                margin: 0 auto;
                background-color: #fff;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
              }
              
              h1 {
                color: #2c3e50;
                margin-bottom: 30px;
                text-align: center;
                border-bottom: 2px solid #eee;
                padding-bottom: 15px;
              }
              
              .form-group {
                margin-bottom: 25px;
              }
              
              label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #445;
              }
              
              input[type="text"],
              select,
              textarea {
                width: 100%;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-size: 16px;
                color: #333;
                box-sizing: border-box;
              }
              
              textarea {
                min-height: 150px;
                resize: vertical;
              }
              
              input[type="file"] {
                border: none;
                padding: 8px 0;
              }
              
              button {
                background-color: #3498db;
                color: white;
                padding: 12px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: background-color 0.3s;
              }
              
              button:hover {
                background-color: #2980b9;
              }
              
              .back-link {
                margin-top: 20px;
                text-align: center;
              }
              
              .back-link a {
                display: inline-block;
                color: #3498db;
                text-decoration: none;
                font-weight: 500;
              }
              
              .back-link a:hover {
                text-decoration: underline;
              }
              
              .image-upload {
                margin-bottom: 25px;
                border: 1px solid #eee;
                border-radius: 8px;
                padding: 15px;
                background-color: #f9f9f9;
              }
              
              .image-upload h3 {
                margin-top: 0;
                color: #333;
                font-size: 16px;
                margin-bottom: 15px;
              }
              
              .image-preview {
                margin-top: 15px;
                text-align: center;
              }
              
              .image-preview img {
                max-width: 300px;
                max-height: 200px;
                border-radius: 5px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
              }
              
              .gallery-preview {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 15px;
              }
              
              .gallery-preview img {
                width: 100px;
                height: 100px;
                object-fit: cover;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
              }
              
              .info-text {
                font-size: 14px;
                color: #666;
                margin-top: 5px;
              }
              
              .button-group {
                display: flex;
                gap: 15px;
                margin-top: 20px;
              }
              
              .summary-container {
                position: relative;
                margin-bottom: 20px;
              }
              
              .ai-button {
                position: absolute;
                right: 0;
                top: 0;
                background-color: #2ecc71;
                color: white;
                border: none;
                padding: 8px 12px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
                transition: background-color 0.3s;
              }
              
              .ai-button:hover {
                background-color: #27ae60;
              }
              
              .ai-button:disabled {
                background-color: #95a5a6;
                cursor: not-allowed;
              }
              
              .word-counter {
                font-size: 12px;
                color: #666;
                margin-top: 5px;
                text-align: right;
              }
              
              .alert-info {
                background-color: #d1ecf1;
                color: #0c5460;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 20px;
                display: none;
              }
              
              .error-message {
                background-color: #f8d7da;
                color: #721c24;
                padding: 12px;
                border-radius: 5px;
                margin-bottom: 20px;
                border: 1px solid #f5c6cb;
              }
              
              .success-message {
                background-color: #d4edda;
                color: #155724;
                padding: 12px;
                border-radius: 5px;
                margin-bottom: 20px;
                border: 1px solid #c3e6cb;
              }
              
              .tag-select {
                display: none; /* Ocultar el select antiguo */
              }
              
              .tags-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 5px;
              }
              
              .tag-option {
                display: flex;
                align-items: center;
                background: #f0f0f0;
                padding: 8px 12px;
                border-radius: 20px;
              }
              
              .tag-option input {
                margin-right: 8px;
              }
              
              .tag-option:hover {
                background: #e0e0e0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>
                Editar Noticia
                <span class="status-badge ${noticia.publishedAt ? 'status-published' : 'status-draft'}">
                  ${noticia.publishedAt ? 'Publicada' : 'Borrador'}
                </span>
              </h1>
              
              ${ctx.query.error ? `<div class="error-message">${ctx.query.error}</div>` : ''}
              ${ctx.query.success ? `<div class="success-message">Noticia actualizada exitosamente</div>` : ''}
              
              <form action="/api/noticias/editar/${noticia.id}" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                  <label for="title">Título *</label>
                  <input type="text" id="title" name="title" value="${noticia.title || ''}" required>
                </div>
                
                <div class="form-group">
                  <label for="content">Contenido *</label>
                  <textarea id="content" name="content" required>${noticia.content || ''}</textarea>
                  <div class="word-counter" id="contentCounter">0 palabras</div>
                </div>
                
                <div class="form-group summary-container">
                  <label for="summary">Resumen</label>
                  <textarea id="summary" name="summary" maxlength="500">${noticia.summary || ''}</textarea>
                  <button type="button" id="generateSummary" class="ai-button" disabled>Generar con IA</button>
                  <div id="summaryAlert" class="alert-info">
                    Para generar un resumen automático, el contenido debe tener al menos 100 palabras.
                  </div>
                </div>
                
                <div class="form-group">
                  <label for="pais">País *</label>
                  <select id="pais" name="pais" required>
                    <option value="chile" ${noticia.pais === 'chile' ? 'selected' : ''}>Chile</option>
                    <option value="paraguay" ${noticia.pais === 'paraguay' ? 'selected' : ''}>Paraguay</option>
                    <option value="brasil" ${noticia.pais === 'brasil' ? 'selected' : ''}>Brasil</option>
                    <option value="argentina" ${noticia.pais === 'argentina' ? 'selected' : ''}>Argentina</option>
                    <option value="mundo" ${noticia.pais === 'mundo' ? 'selected' : ''}>Mundo</option>
                  </select>
                </div>
                
                <!-- Campos ocultos con valores predeterminados -->
                <input type="hidden" id="sourceName" name="sourceName" value="${noticia.sourceName || 'Corredor Biocenico'}">
                <input type="hidden" id="articleType" name="articleType" value="${noticia.articleType || 'regular'}">
                
                <!-- Imagen destacada -->
                <div class="image-upload">
                  <h3>Imagen Destacada</h3>
                  <input type="file" id="featuredImage" name="featuredImage" accept="image/jpeg, image/png, image/gif">
                  <div class="image-upload-info">
                    <p>Formatos aceptados: JPG, PNG, GIF</p>
                    <p>Tamaño máximo: 20 MB</p>
                    <p class="info-text" style="color: #e74c3c;">Si no desea cambiar la imagen, deje este campo vacío</p>
                  </div>
                  ${noticia.featuredImage ? `
                  <div class="image-preview">
                    <p>Imagen actual:</p>
                    <img src="${noticia.featuredImage.url}" alt="${noticia.title}">
                    <p class="info-text">Si sube una nueva imagen, reemplazará la actual</p>
                  </div>` : ''}
                </div>
                
                <!-- Sección para imágenes adicionales -->
                <div class="image-upload">
                  <h3>Imágenes Adicionales (máximo 5)</h3>
                  <input type="file" id="additionalImages" name="additionalImages" accept="image/jpeg, image/png, image/gif" multiple>
                  <div class="image-upload-info">
                    <p>Formatos aceptados: JPG, PNG, GIF</p>
                    <p>Tamaño máximo: 20 MB por imagen</p>
                    <p>Puedes seleccionar hasta 5 imágenes</p>
                    <p class="info-text" style="color: #e74c3c;">Si no desea cambiar las imágenes, deje este campo vacío</p>
                  </div>
                  ${noticia.additionalImages && noticia.additionalImages.length > 0 ? `
                  <div class="gallery-preview">
                    <p>Imágenes actuales (${noticia.additionalImages.length}):</p>
                    <div class="gallery-preview">
                      ${noticia.additionalImages.map(img => `
                        <img src="${img.url}" alt="">
                      `).join('')}
                    </div>
                    <p class="info-text">Si sube nuevas imágenes, estas reemplazarán todas las actuales</p>
                  </div>` : ''}
                </div>
                
                <div class="form-group">
                  <label>Etiquetas</label>
                  <div class="tags-container">
                    ${availableTags.map(tag => {
                      const isSelected = noticia.tags && noticia.tags.some(t => t.id === tag.id);
                      return `
                        <div class="tag-option">
                          <input type="checkbox" id="tag-${tag.id}" name="selectedTags" value="${tag.id}" ${isSelected ? 'checked' : ''}>
                          <label for="tag-${tag.id}">${tag.nombre}</label>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
                
                <div class="button-group">
                  <button type="submit" name="draft" value="true">Guardar como borrador</button>
                  <button type="submit" name="publish" value="true">Publicar ahora</button>
                </div>
              </form>
              
              <div class="back-link">
                <a href="/api/noticias/listar">Volver a la lista de noticias</a>
              </div>
            </div>
            
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                const contentTextarea = document.getElementById('content');
                const summaryButton = document.getElementById('generateSummary');
                const wordCounter = document.getElementById('contentCounter');
                const summaryAlert = document.getElementById('summaryAlert');
                const titleInput = document.getElementById('title');
                
                // Función para contar palabras correctamente
                const countWords = (text) => {
                  return text.trim().match(/\S+/g)?.length || 0;
                };

                // Actualizar contador al cargar la página
                const initialText = contentTextarea.value;
                const initialWordCount = countWords(initialText);
                wordCounter.textContent = initialWordCount + ' palabras';
                
                if (initialWordCount >= 100) {
                  summaryButton.disabled = false;
                  summaryAlert.style.display = 'none';
                }

                contentTextarea.addEventListener('input', function() {
                  const text = this.value;
                  const wordCount = countWords(text);
                  wordCounter.textContent = wordCount + ' palabras';
                  
                  // Habilitar/deshabilitar botón de IA
                  summaryButton.disabled = wordCount < 100;
                  summaryAlert.style.display = wordCount < 100 ? 'block' : 'none';
                });
                
                // Botón para generar resumen con IA
                summaryButton.addEventListener('click', async function() {
                  const content = contentTextarea.value;
                  const title = titleInput.value;
                  
                  if (!content || content.trim().split(/\\s+/).filter(Boolean).length < 100) {
                    alert('El contenido debe tener al menos 100 palabras para generar un resumen.');
                    return;
                  }
                  
                  try {
                    summaryButton.disabled = true;
                    summaryButton.textContent = 'Generando...';
                    
                    const response = await fetch('/api/noticias/generar-resumen', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        content,
                        title
                      })
                    });
                    
                    if (!response.ok) {
                      throw new Error('Error al generar el resumen');
                    }
                    
                    const data = await response.json();
                    document.getElementById('summary').value = data.summary;
                    
                  } catch (error) {
                    console.error('Error:', error);
                    alert('No se pudo generar el resumen. Inténtalo de nuevo más tarde.');
                  } finally {
                    summaryButton.disabled = false;
                    summaryButton.textContent = 'Generar con IA';
                  }
                });
                
                // Formulario
                const form = document.querySelector('form');
                form.addEventListener('submit', function(e) {
                  const wordCount = countWords(contentTextarea.value);
                  if (wordCount < 50) {
                    e.preventDefault();
                    alert('El contenido debe tener al menos 50 palabras.');
                    return false;
                  }
                  return true;
                });
              });
            </script>
          </body>
        </html>
        `);
      } catch (findError) {
        console.error('Error al buscar la noticia:', findError);
        return ctx.redirect('/api/noticias/listar?error=' + encodeURIComponent('No se pudo cargar la noticia para editar'));
      }
    } catch (error) {
      console.error('Error al cargar formulario de edición:', error);
      return ctx.redirect('/api/noticias/listar?error=' + encodeURIComponent('No se pudo cargar el formulario de edición'));
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
      const { format = 'html' } = ctx.query; // Nuevo parámetro para especificar el formato
      
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

      // Base URL para rutas relativas
      const baseUrl = process.env.PUBLIC_URL || 'http://localhost:1337';

      // Si se solicita en formato JSON, devolver los datos estructurados
      if (format === 'json') {
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
            Object.keys(formats).forEach(format => {
              if (formats[format] && formats[format].url) {
                featuredImage.formats[format] = {
                  url: formats[format].url?.startsWith('/') 
                    ? `${baseUrl}${formats[format].url}` 
                    : formats[format].url,
                  width: formats[format].width,
                  height: formats[format].height
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
              Object.keys(formats).forEach(format => {
                if (formats[format] && formats[format].url) {
                  processedImg.formats[format] = {
                    url: formats[format].url?.startsWith('/') 
                      ? `${baseUrl}${formats[format].url}` 
                      : formats[format].url,
                    width: formats[format].width,
                    height: formats[format].height
                  };
                }
              });
            }
            
            additionalImages.push(processedImg);
          }
        }

        // Devolver la noticia y sus imágenes en formato JSON
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
      }

      // Formato por defecto: HTML
      // Formatear la fecha para mostrarla
      const fechaFormateada = noticia.articleDate 
        ? new Date(noticia.articleDate).toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : 'Sin fecha';

      // HTML para mostrar la noticia individual
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${noticia.title}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 20px;
                max-width: 1200px;
                margin: 0 auto;
                color: #333;
              }
              .container {
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                padding: 30px;
                margin-bottom: 20px;
              }
              h1 {
                font-size: 28px;
                margin-top: 0;
                color: #2C3E50;
              }
              .meta {
                color: #7f8c8d;
                margin-bottom: 20px;
                font-size: 14px;
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
              }
              .meta div {
                margin-right: 15px;
              }
              .tags {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin: 20px 0;
              }
              .tag {
                background-color: #e9f5f8;
                color: #3498db;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
              }
              .content {
                margin: 30px 0;
                line-height: 1.8;
              }
              .featured-image {
                width: 100%;
                max-height: 500px;
                object-fit: cover;
                border-radius: 8px;
                margin: 20px 0;
              }
              .additional-images {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 20px 0;
              }
              .additional-image {
                width: 150px;
                height: 150px;
                object-fit: cover;
                border-radius: 4px;
              }
              .back-link {
                display: inline-block;
                margin-top: 20px;
                color: #3498db;
                text-decoration: none;
              }
              .back-link:hover {
                text-decoration: underline;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>${noticia.title}</h1>
              
              <div class="meta">
                <div>ID: ${noticia.id}</div>
                <div>Creada: ${new Date(noticia.createdAt).toLocaleString()}</div>
                ${noticia.publishedAt ? `<div>Publicada: ${new Date(noticia.publishedAt).toLocaleString()}</div>` : ''}
                ${noticia.pais ? `<div>País: ${noticia.pais}</div>` : ''}
                ${noticia.sourceName ? `<div>Fuente: ${noticia.sourceName}</div>` : ''}
              </div>
              
              ${noticia.tags && noticia.tags.length > 0 ? `
                <div class="tags">
                  ${noticia.tags.map(tag => `<span class="tag">${tag.nombre || tag.name || ''}</span>`).join('')}
                </div>
              ` : ''}
              
              <div class="summary">${noticia.summary || ''}</div>
              
              ${noticia.featuredImage ? `
                <img class="featured-image" src="${
                  noticia.featuredImage.url.startsWith('/') 
                    ? baseUrl + noticia.featuredImage.url 
                    : noticia.featuredImage.url
                }" alt="${noticia.title}">
                <div>Imagen Destacada: ${noticia.featuredImage.name || ''}</div>
              ` : ''}
              
              <div class="content">${noticia.content || ''}</div>
              
              ${noticia.additionalImages && noticia.additionalImages.length > 0 ? `
                <h3>Imágenes Adicionales (${noticia.additionalImages.length}):</h3>
                <div class="additional-images">
                  ${noticia.additionalImages.map(img => `
                    <img class="additional-image" src="${
                      img.url.startsWith('/') ? baseUrl + img.url : img.url
                    }" alt="">
                  `).join('')}
                </div>
              ` : ''}

              <a href="/api/noticias/listar" class="back-link">← Volver a la lista de noticias</a>
            </div>
          </body>
        </html>
      `;

      ctx.set('Content-Type', 'text/html; charset=utf-8');
      return ctx.send(html);
    } catch (error) {
      console.error('Error al mostrar noticia:', error);
      ctx.internalServerError('Error al mostrar la noticia');
    }
  },
  async batchScrapeByCountry(ctx) {
    try {
      const scraperService = strapi.service('api::noticia.noticia-scraper');
      const articles = await scraperService.batchScrapeByCountry();
      return articles;
    } catch (error) {
      ctx.throw(500, error);
    }
  }
}))
