import { factories } from '@strapi/strapi'


// Usar el logger del scraper
const logger = {
  info: (...args: any[]) => console.log('\x1b[36m%s\x1b[0m', '[INFO]', ...args),
  warn: (...args: any[]) => console.log('\x1b[33m%s\x1b[0m', '[WARN]', ...args),
  error: (...args: any[]) => console.log('\x1b[31m%s\x1b[0m', '[ERROR]', ...args),
};

//BORRAR DESPUES DE PROBAR
interface MediaFormat {
  url: string;
  width: number;
  height: number;
  hash: string;
  mime: string;
  name: string;
  size: number;
}

interface Media {
  id: string | number;
  url: string;
  formats?: {
    thumbnail?: MediaFormat;
    small?: MediaFormat;
    medium?: MediaFormat;
    large?: MediaFormat;
  };
}

interface Noticia {
  id: string | number;
  title?: string;
  content?: any;
  summary?: string;
  mainImage?: string;
  additionalImages?: Media[];
  publishedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  tags?: {
    id: number;
    nombre: string;
  }[];
  pais?: ("chile" | "paraguay" | "brasil" | "argentina")[];
}

interface NoticiaEntity {
  id: string | number;
  title?: string;
  content?: string;
  tags?: any[];
  pais?: string;
  publishedAt?: string | Date;
  sourceName?: string;
  sourceUrl?: string;
  mainImage?: string;
  summary?: string;
  articleDate?: string | Date;
}

interface NoticiaType {
  id: number;
  title?: string;
  content?: string;
  summary?: string;
  mainImage?: string;
  sourceUrl?: string;
  sourceName?: string;
  publishedAt?: Date;
  articleDate?: Date;
  pais?: string;
  tags?: any[];
  articleType?: string;
  status?: string;
}
//BORRAR LUEGO DE USAR

interface PaginationQuery {
  pagination?: {
    page?: number;
    pageSize?: number;
  };
  filters?: any;
  sort?: string;
  populate?: string;
}

interface FilterQuery {
  $eq?: string;
  $ne?: string;
  $lt?: string | number;
  $lte?: string | number;
  $gt?: string | number;
  $gte?: string | number;
  $in?: string[];
  $notIn?: string[];
  $contains?: string;
  $containsi?: string;
  $or?: Array<Record<string, any>>;
}

interface NoticiaFilters {
  pais?: FilterQuery;
  publishedAt?: FilterQuery;
  'tags.nombre'?: FilterQuery;
  title?: FilterQuery;
  content?: FilterQuery;
}

interface FilterParams {
  tags?: string;
  startDate?: string;
  endDate?: string;
  pais?: string;
}

// Función helper para formatear fechas
const formatDate = (date: string, isEndDate: boolean = false) => {
  const d = new Date(date);
  d.setHours(isEndDate ? 23 : 0);
  d.setMinutes(isEndDate ? 59 : 0);
  d.setSeconds(isEndDate ? 59 : 0);
  d.setMilliseconds(isEndDate ? 999 : 0);
  return d.toISOString();
};

// Template HTML para la vista de prueba
const getViewTemplate = (availableTags: any[], tags: string[], pais: string, startDate: string, endDate: string, results: any[]) => `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Vista de Prueba - Filtros</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .filtros { background: #f5f5f5; padding: 20px; margin-bottom: 20px; }
        .filtro-group { margin-bottom: 10px; }
        .noticia { border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; }
        .tags { color: #666; font-size: 0.9em; }
        .debug { background: #fff3d4; padding: 10px; margin: 10px 0; }
        .tags-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
          padding: 10px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .tag-option {
          display: flex;
          align-items: center;
          padding: 5px;
        }
        .tag-option input[type="checkbox"] {
          margin-right: 8px;
        }
        .tag-option:hover {
          background: #f0f0f0;
        }
      </style>
    </head>
    <body>
      <h1>Vista de Prueba - Filtros</h1>
      
      <div class="filtros">
        <form method="GET">
          <div class="filtro-group">
            <label>Tags:</label>
            <div class="tags-container">
              ${availableTags.map(tag => `
                <label class="tag-option">
                  <input type="checkbox" 
                         name="tags" 
                         value="${tag.nombre}"
                         ${tags?.includes(tag.nombre) ? 'checked' : ''}>
                  ${tag.nombre}
                </label>
              `).join('')}
            </div>
          </div>
          
          <div class="filtro-group">
            <label>País:</label>
            <select name="pais">
              <option value="">Todos</option>
              ${['chile', 'paraguay', 'brasil', 'argentina', 'mundo'].map(p => `
                <option value="${p}" ${pais === p ? 'selected' : ''}>${p.toUpperCase()}</option>
              `).join('')}
            </select>
          </div>
          
          <div class="filtro-group">
            <label>Fecha desde:</label>
            <input type="date" name="startDate" value="${startDate || ''}">
          </div>
          
          <div class="filtro-group">
            <label>Fecha hasta:</label>
            <input type="date" name="endDate" value="${endDate || ''}">
          </div>
          
          <button type="submit">Filtrar</button>
          <button type="button" onclick="location.href='/noticias/view'">Limpiar</button>
        </form>
      </div>

      <div class="debug">
        <strong>Parámetros aplicados:</strong><br>
        Tags: ${tags || 'Ninguno'} | 
        País: ${pais || 'Todos'} | 
        Fechas: ${startDate || ''} a ${endDate || ''}
      </div>

      <h3>Resultados (${results.length} noticias)</h3>
      
      ${results.map(noticia => `
        <div class="noticia">
          <h3>${noticia.title}</h3>
          <div>
            <strong>País:</strong> ${noticia.pais} |
            <strong>Fecha:</strong> ${noticia.fechaFormateada}
          </div>
          <div class="tags">
            <strong>Tags:</strong> 
            ${noticia.tags.map(t => t.nombre).join(', ') || 'Sin tags'}
          </div>
          <div><em>${noticia.summary?.substring(0, 100)}...</em></div>
        </div>
      `).join('')}
    </body>
  </html>
`;

export default factories.createCoreController('api::noticia.noticia', ({ strapi }) => ({
  async scrapeNews(ctx) {
    try {
      const { searchTerm } = ctx.request.body;
      
      logger.info('Iniciando scraping de noticias...');
      const articles = await strapi
        .service('api::noticia.noticia-scraper')
        .scrapeNews(searchTerm);

      ctx.body = {
        status: 'success',
        data: {
          articles: articles.map((article: NoticiaType) => ({
            id: article.id,
            title: article.title,
            content: article.content,
            summary: article.summary,
            mainImage: article.mainImage,
            sourceUrl: article.sourceUrl,
            sourceName: article.sourceName,
            publishedAt: article.publishedAt,
            articleDate: article.articleDate,
            pais: article.pais,
            tags: article.tags,
            status: article.status || 'published'
          })),
          count: articles.length,
          timestamp: new Date().toISOString()
        },
        message: 'Scraping completado exitosamente'
      };
    } catch (error) {
      ctx.body = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
      ctx.status = 400;
    }
  },
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

  //BORRAR TAMBIEN EN MIDDLEWARES.TS
  //VISTA DE LA BASE DE DATOS BORRAR DESPUES DE PROBAR
  async viewNoticias(ctx) {
    try {
      const { tags, startDate, endDate, pais } = ctx.request.query;
      
      logger.info('\n=== INICIO DE BÚSQUEDA ===');
      logger.info('Query params completos:', ctx.request.query);

      // Procesamiento de fechas
      let dateFilter: { articleDate?: { $gte?: Date; $lte?: Date } } = {};
      if (startDate || endDate) {
        logger.info('\n=== PROCESAMIENTO DE FECHAS ===');
        logger.info('Zona horaria del servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);
        logger.info('Hora actual del servidor:', new Date().toISOString());
        
        dateFilter = {
          articleDate: {}
        };
        
        if (startDate) {
          const start = new Date(startDate as string);
          start.setUTCHours(0, 0, 0, 0);
          dateFilter.articleDate.$gte = start;
          logger.info('Fecha inicio procesada:', start.toISOString());
        }
        
        if (endDate) {
          const end = new Date(endDate as string);
          end.setUTCHours(23, 59, 59, 999);
          dateFilter.articleDate.$lte = end;
          logger.info('Fecha fin procesada:', end.toISOString());
        }
      }

      // Obtener resultados usando el nuevo filtro de fechas
      const noticias = await strapi.db.query('api::noticia.noticia').findMany({
        where: {
          $and: [
            tags ? {
              $and: Array.from(new Set(Array.isArray(tags) ? tags : [tags])).map(tag => ({
                tags: {
                  nombre: {
                    $eq: tag
                  }
                }
              }))
            } : {},
            pais ? {
              pais: (pais as string)?.toLowerCase()
            } : {},
            dateFilter, // Usar el nuevo filtro de fechas
            {
              publishedAt: {
                $notNull: true
              }
            }
          ]
        },
        populate: {
          tags: {
            select: ['nombre']
          }
        },
        orderBy: { articleDate: 'desc' }
      });

      logger.info('\n=== DETALLE DE FECHAS ENCONTRADAS ===');
      noticias.forEach((noticia, index) => {
        logger.info(`Noticia ${index + 1}:`, {
          id: noticia.id,
          titulo: noticia.title,
          fecha: noticia.articleDate,
          timestamp: new Date(noticia.articleDate).getTime()
        });
      });

      // Formatear resultados para vista
      const results = noticias.map((noticia: NoticiaEntity) => ({
        ...noticia,
        pais: noticia.pais ? String(noticia.pais) : 'País no especificado',
        tags: noticia.tags || [],
        fechaFormateada: noticia.articleDate 
          ? new Date(noticia.articleDate).toLocaleDateString('es-CL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : 'Sin fecha'
      }));
      
      // Obtener tags disponibles
      const availableTags = await strapi.db.connection('tags')
        .select('*')
        .whereNotNull('published_at');

      // Renderizar vista
      const html = getViewTemplate(
        availableTags,
        Array.isArray(tags) ? tags : [tags].filter(Boolean),
        pais as string,
        startDate as string,
        endDate as string,
        results
      );

      ctx.set('Content-Type', 'text/html; charset=utf-8');
      return ctx.send(html);
      
    } catch (error) {
      ctx.throw(500, `Error al mostrar noticias: ${error.message}`);
    }
  },
  async searchDebug(ctx) {
    try {
      const service = strapi.service('api::noticia.noticia-scraper');
      const results = await service.searchNews();
      
      // Función para sanitizar texto
      const sanitizeText = (text: string) => {
        try {
          // Primero limpiamos caracteres de control
          const cleanText = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
          // Luego convertimos entidades HTML comunes
          return cleanText
            .replace(/&aacute;/g, 'á')
            .replace(/&eacute;/g, 'é')
            .replace(/&iacute;/g, 'í')
            .replace(/&oacute;/g, 'ó')
            .replace(/&uacute;/g, 'ú')
            .replace(/&ntilde;/g, 'ñ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
        } catch (error) {
          return text;
        }
      };

      const sanitizeUrl = (url: string) => {
        try {
          return encodeURI(url);
        } catch {
          return url;
        }
      };
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <title>Resultados de Búsqueda - Corredor Bioceánico</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .result { border: 1px solid #ddd; padding: 15px; margin: 10px 0; }
              .title { color: #1a0dab; text-decoration: none; font-size: 18px; }
              .snippet { color: #4d5156; margin: 5px 0; }
              .meta { color: #70757a; font-size: 14px; }
            </style>
          </head>
          <body>
            <h1>Resultados de Búsqueda - Corredor Bioceánico</h1>
            ${results.map(item => `
              <div class="result">
                <a href="${sanitizeUrl(item.link)}" class="title" target="_blank">
                  ${sanitizeText(item.title)}
                </a>
                <p class="snippet">${sanitizeText(item.snippet)}</p>
                <div class="meta">
                  Fuente: ${sanitizeText(item.source)}
                  ${item.publishedTime ? 
                    `| Publicado: ${new Date(item.publishedTime).toLocaleDateString('es-CL')}` : 
                    ''}
                </div>
              </div>
            `).join('')}
          </body>
        </html>
      `;

      ctx.set('Content-Type', 'text/html; charset=utf-8');
      return ctx.send(html);
    } catch (error) {
      console.error('Error en searchDebug:', error);
      ctx.throw(500, `Error al procesar la búsqueda: ${error.message}`);
    }
  },
  async testScraper(ctx) {
    try {
      const scraper = strapi.service('api::noticia.noticia-scraper');
      const scrapedResults = await scraper.scrapeNews();

      // Obtener noticias con campos explícitos
      const noticias = await strapi.entityService.findMany('api::noticia.noticia', {
        populate: {
          tags: true // Populate explícito para relaciones
        }
      });

      // Formatear resultados
      const results = noticias.map((noticia: any) => ({
        ...noticia,
        // Convertir pais a string seguro
        pais: noticia.pais ? String(noticia.pais) : 'País no especificado'
      }));

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Resultados del Scraper</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f5f6fa;
              }
              .container {
                max-width: 1200px;
                margin: 0 auto;
              }
              .article {
                background: white;
                border-radius: 12px;
                padding: 25px;
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .title {
                color: #2c3e50;
                font-size: 1.5em;
                margin-bottom: 15px;
              }
              .meta {
                color: #666;
                font-size: 0.9em;
                margin-bottom: 15px;
              }
              .content {
                color: #2c3e50;
                line-height: 1.6;
              }
              .image {
                width: 100%;
                max-height: 400px;
                object-fit: cover;
                border-radius: 8px;
                margin: 15px 0;
              }
              .categories {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 15px 0;
              }
              .category {
                background: #e3f2fd;
                color: #1565c0;
                padding: 5px 12px;
                border-radius: 15px;
                font-size: 0.9em;
              }
              pre {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                overflow-x: auto;
                font-size: 0.9em;
                color: #2c3e50;
              }
              .content p {
                margin-bottom: 1.2em;
                text-align: justify;
              }
              .no-image {
                background: #f5f5f5;
                padding: 20px;
                text-align: center;
                border-radius: 8px;
                color: #666;
              }
              .summary {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                border-left: 4px solid #2196F3;
              }
              .summary h3 {
                color: #1565c0;
                margin-top: 0;
              }
              .country {
                background: #e8f5e9;
                color: #2e7d32;
              }
              .full-content {
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Resultados del Test Scraper</h1>
              ${results.map(result => `
                <div class="article">
                  <h2 class="title">${result.title || 'Sin título'}</h2>
                  <div class="meta">
                    <div>Fuente: ${result.sourceName}</div>
                    <div>País: ${result.pais.toUpperCase()}</div>
                    <div>Fecha: ${result.articleDate ? new Date(result.articleDate).toLocaleDateString('es-CL') : 'No disponible'}</div>
                    <div>URL: <a href="${result.sourceUrl}" target="_blank">${result.sourceUrl}</a></div>
                  </div>
                  ${result.mainImage ? `
                    <img class="image" src="${result.mainImage}" alt="${result.title || 'Imagen de noticia'}">
                  ` : '<div class="no-image">Sin imagen disponible</div>'}
                  <div class="categories">
                    ${result.tags.map(tag => `
                      <span class="category">${tag.nombre || tag.name || ''}</span>
                    `).join('')}
                    ${result.pais ? `
                      <span class="category country">${result.pais.toUpperCase()}</span>
                    ` : ''}
                  </div>
                  <div class="content">
                    ${result.summary ? `
                      <div class="summary">
                        <h3>Resumen:</h3>
                        <p>${result.summary}</p>
                      </div>
                    ` : ''}
                    <div class="full-content">
                      <h3>Contenido:</h3>
                      ${result.content.split('\n').map(paragraph => 
                        paragraph.trim() ? `<p>${paragraph}</p>` : ''
                      ).join('')}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </body>
        </html>
      `;

      ctx.set('Content-Type', 'text/html; charset=utf-8');
      return ctx.send(html);
    } catch (error) {
      console.error('Error en testScraper:', error);
      ctx.throw(500, `Error al procesar el test del scraper: ${error.message}`);
    }
  },
  // Helper para obtener tags disponibles
  async getAvailableTags() {
    const tags = await strapi.db.connection('tags')
      .select('nombre')
      .whereNotNull('published_at')
      .orderBy('nombre', 'asc');
    
    return tags.map(t => t.nombre);
  },
}))