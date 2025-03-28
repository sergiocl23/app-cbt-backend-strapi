import axios from 'axios';
import * as cheerio from 'cheerio';
import { getSelectorsForDomain, extractContent, extractImage, OFFICIAL_DOMAINS, categorizeContent, extractDate } from './site-selectors';
import { HfInference } from '@huggingface/inference';
import { es } from 'date-fns/locale';
import { format } from 'date-fns';

// =============================================
// INTERFACES
// =============================================
interface SearchResult {
  link: string;
  displayLink: string;
  snippet: string;
  title: string;
  pagemap?: {
    metatags?: Array<{
      'article:published_time'?: string;
    }>;
    cse_image?: Array<{
      src?: string;
    }>;
  };
}

interface SimpleSearchResult {
  title: string;
  link: string;
  snippet: string;
  publishedTime?: string;
  source: string;
}

interface ContentValidationResult {
  isValid: boolean;
  reasons: string[];
}

// Nueva interfaz para resultado de relevancia
interface RelevanceResult {
  isRelevant: boolean;
  score: number;
  matchedKeywords: string[];
}

// =============================================
// CONFIGURACIONES
// =============================================
const scraperConfig = {
  maxArticlesPerTerm: 60, // Reducido para pruebas
  maxTotalArticles: 150, // Reducido para pruebas
  batchDays: 7, 
  optimizedSearchConfig: {
    terms: {
      es: [
        'Corredor Bioceánico Vial', 
        'Corredor Bioceánico Capricornio'
      ],
      pt: [
        'Rota Bioceânica', 
        'Corredor Bioceânico Capricórnio'
      ]
    },
    countries: [
      { code: 'cl', name: 'Chile', language: 'es' },
      { code: 'py', name: 'Paraguay', language: 'es' },
      { code: 'ar', name: 'Argentina', language: 'es' },
      { code: 'br', name: 'Brasil', language: 'pt' }
    ]
  },
  searchParams: {
    dateRestrict: 'd7',
    sort: 'date'
  },
  excludedSites: 'facebook.com|twitter.com|instagram.com|linkedin.com|youtube.com|tiktok.com|pinterest.com|scribd.com|slideshare.net|medium.com|issuu.com|archive.org|academia.edu|researchgate.net|google.com|google.cl|google.py|google.br|google.ar|wikipedia.org'
};

const API_KEYS = [
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_2,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_3,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_4
];

// =============================================
// CONSTANTES
// =============================================
// Palabras clave relevantes para el corredor bioceánico
const CORRIDOR_KEYWORDS = {
  nombres: [
    'corredor',
    'bioceánico',
    'bioceanico',
    'bioceânico',
    'rodoviário',
    'capricornio',
    'capricórnio',
    'ruta',
    'rota',
    'corredor vial',
    'corredor de integración',
    'corredor de capricornio',
    'corredor rodoviário',
    'eixo bioceânico',
    'carretera bioceánica'
  ],
  paises: [
    'chile',
    'paraguay',
    'paraguai',
    'brasil',
    'argentina'
  ],
  temas: [
    'infraestructura',
    'puertos',
    'comercio',
    'comércio',
    'transporte',
    'exportación',
    'exportaciones',
    'carga',
    'mercancías',
    'mercaderias',
    'integración',
    'aduana',
    'logística',
    'carreteras',
    'desarrollo',
    'inversión',
    'construcción',
    'ministros',
    'presidentes',
    'mercosur',
    'ruta',
    'santos',
    'antofagasta',
    'iquique',
    'murtinho',
    'carmelo peralta',
    'puerto murtinho'
  ]
};

// Lista de User-Agents para rotación (diversidad de navegadores y dispositivos)
const USER_AGENTS = [
  // Navegadores de escritorio
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  // Navegadores móviles
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1'
];

// Índice actual para rotación de User-Agents
let currentUserAgentIndex = 0;

// Obtener el siguiente User-Agent de la lista (rotación)
function getNextUserAgent() {
  const userAgent = USER_AGENTS[currentUserAgentIndex];
  currentUserAgentIndex = (currentUserAgentIndex + 1) % USER_AGENTS.length;
  return userAgent;
}

// =============================================
// INSTANCIAS Y UTILIDADES
// =============================================
let currentKeyIndex = 0;

const logger = {
  info: (...args: any[]) => {
    const message = args[0];
    if (message.startsWith('=== INICIANDO SCRAPING DE ARTÍCULO ===') || 
        message.startsWith('=== DATOS EXTRAÍDOS ===') || 
        message.startsWith('=== HUGGINGFACE SUMMARIZATION ===')) {
      console.log('\x1b[36m%s\x1b[0m', '[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => {
    const message = args[0];
    if (message.startsWith('=== DOMINIOS NO IMPLEMENTADOS ===')) {
      console.log('\x1b[33m%s\x1b[0m', '[WARN]', ...args);
    }
  },
  error: (...args: any[]) => console.log('\x1b[31m%s\x1b[0m', '[ERROR]', ...args),
};

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3'
  },
  maxRedirects: 5,
  validateStatus: (status) => status < 500
});

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');

// =============================================
// SECCIÓN PRINCIPAL DEL SCRAPER
// =============================================
// Función principal que orquesta todo el proceso de scraping:
// 1. Realiza búsquedas en Google News usando términos configurados
// 2. Filtra y ordena resultados
// 3. Extrae contenido de cada artículo encontrado
// 4. Valida y almacena en la base de datos de Strapi
export default ({ strapi }) => ({
  async scrapeNews(searchTerm = "Corredor Bioceanico", country?: string) {
    try {
      // Fase 1: Búsqueda de noticias
      logger.info('=== INICIANDO SCRAPING DE NOTICIAS ===');
      const results = await this.searchNews(searchTerm, country);
      
      
      // Fase 2: Procesamiento de resultados
      const savedArticles = [];
      const failedDomains = [];
      const minimalArticles = []; // Nuevo array para almacenar artículos minimales
      
      for (const result of results) {
        try {
          // Verificación de duplicados en la base de datos
          const existing = await strapi.entityService.findMany('api::noticia.noticia', {
            filters: { sourceUrl: result.link }
          });

          if (existing.length > 0) {
            logger.info(`Artículo ya existe: ${result.link}`);
            continue;
          }

          // Fase 3: Extracción de contenido del artículo
          const articleData = await this.extractArticleData(result.link, result);
          
          // Si no se pudo extraer contenido (no hay selectores o falló el scraping)
          if (!articleData) {
            // Nuevo flujo: Verificar relevancia y guardar versión mínima si es relevante
            const relevance = this.isRelevantNewsItem(result.title, result.snippet);
            
            if (relevance.isRelevant) {
              // Si la noticia es relevante, guardar versión mínima
              const minimalArticle = await this.saveMinimalNewsItem(result, relevance);
              if (minimalArticle) {
                savedArticles.push({ ...minimalArticle, status: 'minimal' });
                // Añadir a la lista de artículos minimales
                minimalArticles.push({
                  titulo: result.title,
                  puntuacion: relevance.score,
                  palabrasClave: relevance.matchedKeywords.join(', '),
                  fuente: result.source,
                  url: result.link
                });
                logger.info(`💡 Guardado como artículo mínimo: ${result.title} (Score: ${relevance.score})`);
                logger.info(`   Keywords: ${relevance.matchedKeywords.join(', ')}`);
              }
            } else {
              // Si no es relevante, registrar como dominio fallido
              failedDomains.push(result.link);
              logger.info(`❌ Artículo no relevante (${relevance.score}/100): ${result.title}`);
            }
            continue;
          }

          // Fase 4: Almacenamiento en base de datos
          const existingArticle = await strapi.db.query('api::noticia.noticia').findOne({
            where: { 
              $or: [
                { sourceUrl: articleData.sourceUrl },
                { slug: articleData.slug }
              ]
            }
          });

          if (existingArticle) {
            logger.info(`🔄 Artículo duplicado: ${articleData.title}`);
            savedArticles.push({ ...articleData, status: 'duplicated' });
          } else {
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
                tags: {
                  connect: await this.handleTags(articleData.tags)
                },
                articleType: 'regular',
                publishState: 'published'
              },
              populate: ['tags']
            });

            savedArticles.push(savedArticle);
            logger.info(`✅ Artículo guardado: ${articleData.title}`);
          }

        } catch (error) {
          logger.error(`Error procesando artículo ${result.link}:`, error);
          failedDomains.push(result.link);
        }
      }

      

      
      if (savedArticles.length > 0) {
        // Ordenar por tipo de artículo y fecha para mejor organización
        const sortedArticles = [...savedArticles].sort((a, b) => {
          // Primero ordenar por tipo de artículo (regular, minimal)
          if ((a.articleType || 'regular') !== (b.articleType || 'regular')) {
            return (a.articleType || 'regular') === 'regular' ? -1 : 1;
          }
          // Luego por fecha, más recientes primero
          return new Date(b.articleDate || b.publishedAt).getTime() - 
                 new Date(a.articleDate || a.publishedAt).getTime();
        });
        
        // Formato para copiar y pegar fácilmente
        sortedArticles.forEach(article => {
          const date = article.articleDate || article.publishedAt;
          const formattedDate = date ? format(new Date(date), 'yyyy-MM-dd') : 'sin-fecha';
          const articleType = article.articleType || 'regular';
          const score = article.relevanceScore || 'N/A';
        });
      }

      return savedArticles;
    } catch (error) {
      throw error;
    }
  },

  // Nuevo método para guardar noticias mínimas
  async saveMinimalNewsItem(result: SimpleSearchResult, relevance: RelevanceResult) {
    try {
      // Verificar si la URL parece ser específica de un artículo
      if (!isValidArticleUrl(result.link)) {
        return null;
      }
      
      // Procesar la fecha si está disponible
      let publishedDate = null;
      if (result.publishedTime) {
        publishedDate = new Date(result.publishedTime);
      }
      
      // Extraer imagen si está disponible en los metadatos
      const pagemap = (result as any).pagemap;
      let mainImage = null;
      if (pagemap?.cse_image && pagemap.cse_image[0]?.src) {
        mainImage = pagemap.cse_image[0].src;
      }
      
      // Generar slug a partir del título
      const slug = result.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Crear la noticia mínima en la base de datos
      const minimalArticle = await strapi.entityService.create('api::noticia.noticia', {
        data: {
          title: result.title,
          slug: slug,
          // Usar el snippet como contenido básico
          content: `<p>${result.snippet}</p><p><a href="${result.link}" target="_blank">Ver artículo original</a></p>`,
          summary: result.snippet.length > 150 ? result.snippet.substring(0, 147) + '...' : result.snippet,
          mainImage: mainImage,
          sourceUrl: result.link,
          sourceName: result.source,
          publishedAt: new Date(),
          articleDate: publishedDate || new Date(),
          // Usar "mundo" en lugar de "desconocido" para el país
          pais: 'mundo',
          // No conectamos tags porque no tenemos certeza del contenido completo
          articleType: 'minimal',
          // Guardar la puntuación de relevancia
          relevanceScore: relevance.score,
          publishState: 'published'
        }
      });
      
      return minimalArticle;
    } catch (error) {
      logger.error(`Error guardando artículo mínimo ${result.link}:`, error);
      return null;
    }
  },

  // =============================================
  // BÚSQUEDA INTELIGENTE DE NOTICIAS
  // =============================================
  // Utiliza la API de Google Custom Search con:
  // - Rotación automática de API Keys
  // - Paginación de resultados
  // - Filtros por fecha y sitios específicos
  async searchNews(searchTerm?: string, country?: string): Promise<SimpleSearchResult[]> {
    try {
      logger.info('Iniciando búsqueda de noticias...');
      
      if (country) {
        logger.info(`Filtrando resultados para país: ${country.toUpperCase()}`);
      }
      
      const allResults: SimpleSearchResult[] = [];
      const termsToSearch = searchTerm ? [searchTerm] : ["Corredor Bioceanico"];

      for (const term of termsToSearch) {
        let start = 1;
        while (allResults.length < scraperConfig.maxArticlesPerTerm) {
          const results = await getSearchResults(term, start, country);
          if (!results.length) break;
          
          allResults.push(...results.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            source: item.displayLink,
            publishedTime: item.pagemap?.metatags?.[0]?.['article:published_time'] || null
          })));

          start += 10;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Filtrado más estricto para eliminar duplicados y ordenar resultados
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      return Array.from(new Map(allResults.map(item => [item.link, item])).values())
        .filter(item => {
          // Filtrar por fecha cuando está disponible
          if (item.publishedTime) {
            const pubDate = new Date(item.publishedTime);
            return pubDate >= oneWeekAgo;
          }
          return true; // Mantener artículos sin fecha
        })
        .sort((a, b) => {
          // Priorizar primero artículos con fecha
          if (a.publishedTime && !b.publishedTime) return -1;
          if (!a.publishedTime && b.publishedTime) return 1;
          
          // Ordenar por fecha más reciente
          if (a.publishedTime && b.publishedTime) {
            return new Date(b.publishedTime).getTime() - new Date(a.publishedTime).getTime();
          }
          
          // Para artículos sin fecha, ordenar alfabéticamente
          return a.title.localeCompare(b.title);
        });
    } catch (error) {
      logger.error('Error en searchNews:', error);
      throw error;
    }
  },

  // =============================================
  // EXTRACCIÓN DE CONTENIDO DE ARTÍCULOS
  // =============================================
  // Proceso que:
  // 1. Descarga el HTML de la noticia
  // 2. Aplica selectores específicos para el dominio
  // 3. Extrae título, contenido, imagen y fecha
  // 4. Genera resumen con IA (Hugging Face)
  async extractArticleData(url: string, articleData?: SimpleSearchResult & { skipValidation?: boolean }) {
    try {
      logger.info('=== INICIANDO SCRAPING DE ARTÍCULO ===');
      logger.info('URL:', url);

      const response = await fetchWithRetry(url);
      const $ = cheerio.load(response.data);
      const selectors = getSelectorsForDomain(url);
      
      if (!selectors) return null;

      const { content } = await extractContent($, selectors.content);
      if (!content || content.trim().length === 0) {
        logger.error('❌ Contenido vacío:', url);
        return null;
      }

      // Validar el contenido antes de continuar con el procesamiento
      // Saltamos la validación si skipValidation es true (enlaces de RSS)
      let validation = { isValid: true, reasons: [] };
      if (!articleData?.skipValidation) {
        validation = isValidContent(content, url);
      if (!validation.isValid) {
        logger.error(`❌ Contenido inválido (${url}):`, validation.reasons.join(', '));
        return null;
        }
      } else {
        logger.info('⚠️ Omitiendo validación de contenido para enlace RSS');
      }

      const { content: title } = await extractContent($, selectors.title);
      if (!title || title.trim().length === 0) {
        logger.error('❌ Título vacío:', url);
        return null;
      }

      const mainImage = await extractImage($, selectors.image, url);
      const summary = await generateSummary(content, title);
      const { tags, pais } = categorizeContent(url, content);
      const extractedDate = await extractDate($, selectors.date, selectors.dateFormats, selectors);
      const finalDate = extractedDate || 
                       (articleData?.publishedTime ? new Date(articleData.publishedTime) : new Date());
      const formattedDate = format(finalDate, 'dd/MM/yyyy HH:mm:ss', { locale: es });
      
      logger.info('=== DATOS EXTRAÍDOS ===');
      logger.info('Título:', title);
      logger.info('Fecha extraída:', formattedDate);
      logger.info('Resumen:', summary.substring(0, 50) + '...');
      logger.info('Longitud contenido:', content.length);
      logger.info('Imagen:', mainImage ? '✅' : '❌');
      logger.info('Validación:', validation.isValid ? '✅' : '❌');

      return {
        title,
        content,
        summary,
        mainImage,
        sourceUrl: url,
        publishedAt: finalDate,
        sourceName: articleData?.source,
        tags,
        pais,
        created_at: new Date(),
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      };
    } catch (error) {
      logger.error(`❌ Error extrayendo ${url}:`, error.message);
      return null;
    }
  },

  async handleTags(tagNames: string[]): Promise<number[]> {
    const filteredTags = tagNames.filter(t => t !== 'corredor_bioceanico');
    const tags = [];
    for (const name of filteredTags) {
      const existingTag = await strapi.entityService.findMany('api::tag.tag', {
        filters: { nombre: name }
      });
      
      if (existingTag.length > 0) {
        tags.push(existingTag[0].id);
      } else {
        const newTag = await strapi.entityService.create('api::tag.tag', {
          data: { 
            nombre: name,
            slug: name.toLowerCase().replace(/\s+/g, '-')
          }
        });
        tags.push(newTag.id);
      }
    }
    return tags;
  },

  /**
   * Método para ejecutar scraping por lotes en todos los países configurados
   * @returns Un array con todos los artículos guardados
   */
  async batchScrapeByCountry() {
    try {
      logger.info('=== INICIANDO SCRAPING POR PAÍSES ===');
      const allSavedArticles = [];
      const countries = scraperConfig.optimizedSearchConfig.countries;
      
      // Set para almacenar todas las URLs únicas encontradas
      const allFoundUrls = new Set();
      
      // Para cada país configurado
      for (const country of countries) {
        logger.info(`Procesando país: ${country.name} (${country.code.toUpperCase()})`);
        
        // Seleccionar los términos según idioma del país
        const terms = scraperConfig.optimizedSearchConfig.terms[country.language];
        
        // Para cada término en el idioma adecuado
        for (const term of terms) {
          logger.info(`Buscando "${term}" en ${country.name}`);
          
          // Ejecutar la búsqueda pero capturar los resultados crudos antes de procesar
          const rawResults = await this.searchNews(term, country.code);
          
          // Almacenar todas las URLs encontradas
          rawResults.forEach(result => {
            allFoundUrls.add(result.link);
          });
          
          // Ejecutar búsqueda específica para este término y país
          const savedArticles = await this.scrapeNews(term, country.code);
          
          if (savedArticles.length > 0) {
            logger.info(`✅ Se guardaron ${savedArticles.length} artículos de ${country.name} con término "${term}"`);
            allSavedArticles.push(...savedArticles);
          } else {
            logger.info(`⚠️ No se encontraron artículos para ${country.name} con término "${term}"`);
          }
          
          // Pausa entre búsquedas para evitar sobrecarga de la API
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // Informe final
      const summary = scraperConfig.optimizedSearchConfig.countries.map(country => {
        const countryArticles = allSavedArticles.filter(article => 
          article.pais?.toLowerCase() === country.name.toLowerCase()
        );
        return {
          País: country.name,
          Artículos: countryArticles.length,
          Porcentaje: `${Math.round((countryArticles.length / allSavedArticles.length) * 100)}%`
        };
      });
      
      // Agrupar URLs por dominio para mejor visualización
      const domainGroups = {};
      [...allFoundUrls].forEach(url => {
        try {
          const domain = new URL(url).hostname;
          if (!domainGroups[domain]) {
            domainGroups[domain] = [];
          }
          domainGroups[domain].push(url);
        } catch (error) {
        }
      });
      
      // Mostrar URLs agrupadas por dominio
      Object.entries(domainGroups as Record<string, any[]>)
        .sort((a, b) => (b[1] as any[]).length - (a[1] as any[]).length)
        .forEach(([domain, urls]) => {
          console.log(`\n📌 ${domain} (${(urls as any[]).length} URLs):`);
          (urls as string[]).forEach(url => console.log(`   ${url}`));
        });
      
      return allSavedArticles;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Busca noticias recientes sobre el Corredor Bioceánico usando RSS de Google News con Puppeteer
   * @returns Array de noticias encontradas
   */
  async findGoogleNewsRSS(searchTerms?: string[]) {
    try {
      
      // Términos de búsqueda por defecto si no se proporcionan, REDUCIDOS a los más importantes
      const terms = searchTerms || [
        'Corredor Bioceánico',
        'Corredor Bioceánico Capricornio',
        'Rota Bioceânica', 
      ];
      
      const allNewsItems = [];
      const MAX_ITEMS_PER_TERM = 10; // Limitamos a 10 resultados por término
      
      for (const term of terms) {
        try {          
          // URL del feed RSS de Google News con parámetro de tiempo (7 días)
          const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=es&gl=LATAM&ceid=LATAM:es&when:7d`;
          
          const response = await axiosInstance.get(googleNewsUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
                    
          // Parsear XML del feed RSS
          const $ = cheerio.load(response.data, { xmlMode: true });
          
          // Enlaces a resolver
          const googleNewsLinks = [];
          
          // Limitar la cantidad de items a procesar
          $('item').slice(0, MAX_ITEMS_PER_TERM).each((_, item) => {
            const title = $(item).find('title').text().trim();
            const link = $(item).find('link').text().trim();
            const pubDate = new Date($(item).find('pubDate').text().trim());
            const source = $(item).find('source').text().trim();
                        
            // Guardar enlace para resolver después
            googleNewsLinks.push({
              googleNewsUrl: link,
              title,
              pubDate,
              source,
              searchTerm: term
            });
          });          
          // Resolver URLs con timeouts
          const resolvedItems = await resolveGoogleNewsLinks(googleNewsLinks);
          allNewsItems.push(...resolvedItems);
          
          // Pausa entre búsquedas de términos
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Error buscando en Google News RSS para "${term}":`, error.message);
        }
      }
      
      // Eliminar duplicados por URL
      const uniqueResults = Array.from(
        new Map(allNewsItems.map(item => [item.link, item])).values()
      );
      
      // Ordenar por fecha más reciente
      uniqueResults.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());      
      // Agrupar por dominio para análisis
      const groupedByDomain: Record<string, Array<any>> = {};
      uniqueResults.forEach(item => {
        if (!groupedByDomain[item.sourceDomain]) {
          groupedByDomain[item.sourceDomain] = [];
        }
        groupedByDomain[item.sourceDomain].push(item);
      });
      
      Object.entries(groupedByDomain)
        .sort((a, b) => (b[1] as Array<any>).length - (a[1] as Array<any>).length)
        .forEach(([domain, items]) => {
          console.log(`📌 ${domain}: ${(items as Array<any>).length} noticias`);
        });
      
      return uniqueResults;
    } catch (error) {
      return [];
    }
  },

  async findNewsCombined(ctx) {
    try {
      // Obtener parámetros
      const searchTerms = typeof ctx.query.terms === 'string'
        ? ctx.query.terms.split(',').map(t => t.trim())
        : ["Corredor Bioceánico", "Corredor Bioceánico Capricornio", "Rota Bioceânica"];
        
      const country = ctx.query.country;
      
      // Estadísticas
      const stats = {
        total: { found: 0, processed: 0, saved: 0, savedMinimal: 0, duplicated: 0, failed: 0 },
        rss: { found: 0, resolved: 0, minimal: 0 },
        cse: { found: 0, minimal: 0 }
      };
      
      // 1. BÚSQUEDA VÍA RSS
      const rssResults = await strapi.service('api::noticia.noticia-scraper').findGoogleNewsRSS(searchTerms);
      stats.rss.found = rssResults.length;
      stats.rss.resolved = rssResults.filter(item => item.link && !item.link.includes('news.google.com')).length;
      stats.rss.minimal = rssResults.filter(item => item.link && item.link.includes('news.google.com')).length;
      
      // Guardar enlaces ya procesados
      const processedUrls = new Map();
      
      // Artículos guardados
      const savedArticles = [];
      
      // Procesar resultados RSS
      for (const item of rssResults) {
        try {
          stats.total.processed++;
          
          // Verificar si ya existe en la base de datos
          const existing = await strapi.entityService.findMany('api::noticia.noticia', {
            filters: { sourceUrl: item.link }
          });

          if (existing.length > 0) {
            stats.total.duplicated++;
            continue;
          }
          
          // Marcar como procesado
          processedUrls.set(item.link, 'rss');
          
          // Verificar si es una URL de Google News sin resolver o una URL resuelta
          const isGoogleNewsUrl = item.link.includes('news.google.com');
          
          if (isGoogleNewsUrl) {
            // CASO 1: URL no resuelta - guardar versión mínima            
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
                publishState: 'published'
              }
            });
            
            savedArticles.push(minimalArticle);
            stats.total.savedMinimal++;
            stats.total.saved++;            
          } else {
            // CASO 2: URL resuelta - intentar extraer contenido completo            
            // Extraer datos del artículo
            const articleData = await strapi.service('api::noticia.noticia-scraper').extractArticleData(item.link, {
              title: item.title,
              source: item.sourceName,
              publishedTime: item.publishedDate
            });
            
            if (articleData) {
              // Guardar artículo completo
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
                  tags: {
                    connect: await strapi.service('api::noticia.noticia-scraper').handleTags(articleData.tags)
                  },
                  articleType: 'regular',
                  publishState: 'published'
                }
              });
              
              savedArticles.push(savedArticle);
              stats.total.saved++;
            } else {
              // Falló la extracción, guardar versión mínima              
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
                  publishState: 'published'
                }
              });
              
              savedArticles.push(minimalArticle);
              stats.total.savedMinimal++;
              stats.total.saved++;
            }
          }
        } catch (error) {
          stats.total.failed++;
        }
      }
      
      // 2. BÚSQUEDA VÍA CSE
      let cseResults = [];
      for (const term of searchTerms) {
        const termResults = await strapi.service('api::noticia.noticia-scraper').searchNews(term, country);
        cseResults = [...cseResults, ...termResults];
      }
      stats.cse.found = cseResults.length;
      
      // Filtrar duplicados entre RSS y CSE
      const uniqueCseResults = cseResults.filter(item => !processedUrls.has(item.link));
      
      // Procesar resultados CSE
      for (const item of uniqueCseResults) {
        try {
          stats.total.processed++;
          
          // Verificar si ya existe en la base de datos
          const existing = await strapi.entityService.findMany('api::noticia.noticia', {
            filters: { sourceUrl: item.link }
          });

          if (existing.length > 0) {
            console.log(`Artículo ya existe: ${item.link}`);
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
                tags: {
                  connect: await strapi.service('api::noticia.noticia-scraper').handleTags(articleData.tags)
                },
                articleType: 'regular',
                publishState: 'published'
              }
            });
            
            savedArticles.push(savedArticle);
            stats.total.saved++;
            console.log(`✅ Artículo completo guardado (CSE): ${articleData.title}`);
          } else {
            // Falló la extracción, guardar versión mínima
            console.log(`No se pudo extraer contenido (CSE), guardando mínimo: ${item.link}`);
            
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
                publishState: 'published'
              }
            });
            
            savedArticles.push(minimalArticle);
            stats.total.savedMinimal++;
            stats.total.saved++;
            stats.cse.minimal++;
            console.log(`⚠️ Artículo mínimo guardado (CSE, extracción fallida): ${item.title}`);
          }
        } catch (error) {
          console.error(`Error procesando (CSE): ${item.link}`, error);
          stats.total.failed++;
        }
      }
      
      // Resumen estadístico
      console.log('=== RESULTADOS DE LA BÚSQUEDA COMBINADA ===');
      console.log(`Total enlaces encontrados: ${stats.total.found = stats.rss.found + stats.cse.found}`);
      console.log(`  - RSS: ${stats.rss.found} (resueltos: ${stats.rss.resolved}, mínimos: ${stats.rss.minimal})`);
      console.log(`  - CSE: ${stats.cse.found} (únicos: ${uniqueCseResults.length}, mínimos: ${stats.cse.minimal})`);
      console.log(`Artículos procesados: ${stats.total.processed}`);
      console.log(`  - Guardados: ${stats.total.saved} (completos: ${stats.total.saved - stats.total.savedMinimal}, mínimos: ${stats.total.savedMinimal})`);
      console.log(`  - Duplicados: ${stats.total.duplicated}`);
      console.log(`  - Fallidos: ${stats.total.failed}`);
      
      return {
        stats,
        savedArticles
      };
      
    } catch (error) {
      console.error('Error en búsqueda combinada:', error);
      ctx.status = 500;
      ctx.body = { error: 'Error en búsqueda combinada' };
    }
  },

  isRelevantNewsItem(title: string, snippet: string): RelevanceResult {
    // Normalizar textos para búsqueda - mejorar la normalización
    const normalizedTitle = title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Eliminar acentos
    
    // También analizar el slug/url si está disponible en el título
    const hasCorredorInUrl = title.includes('/corredor-bioceanico') || 
                           title.includes('corredor-bioceánico') ||
                           title.includes('corredor-bioceanico') ||
                           title.includes('proyecto-del-corredor') ||
                           title.includes('desarrollo-del-corredor');
    
    // Criterios de relevancia
    const matchedKeywords: string[] = [];
    let score = 0;
    
    // ENFOQUE MEJORADO: Ampliar la detección de términos
    
    // 1. Detectar términos clave y sus variantes
    const titleContainsCorredor = normalizedTitle.includes('corredor');
    const titleContainsBioceanico = 
      normalizedTitle.includes('bioceanico') || 
      normalizedTitle.includes('bioceánico') || 
      normalizedTitle.includes('bioceânico');
    const titleContainsProyecto = 
      normalizedTitle.includes('proyecto del corredor') || 
      normalizedTitle.includes('proyecto corredor') ||
      normalizedTitle.includes('desarrollar corredor') ||
      normalizedTitle.includes('desarrollo del corredor') ||
      normalizedTitle.includes('desarrollo de corredor');
    const titleContainsRuta = 
      normalizedTitle.includes('ruta bioceanica') || 
      normalizedTitle.includes('rota bioceânica') || 
      normalizedTitle.includes('carretera bioceánica') ||
      normalizedTitle.includes('carretera bioceanica');
    const titleContainsCapricornio = 
      normalizedTitle.includes('capricornio') || 
      normalizedTitle.includes('capricórnio');
    const titleContainsIntegracion = 
      normalizedTitle.includes('integracion regional') || 
      normalizedTitle.includes('integración regional') ||
      normalizedTitle.includes('integração regional');
    
    // Verificar términos cercanos (corredor cerca de bioceánico)
    const closeTerms = normalizedTitle.match(/corredor.{0,15}bioc[ea][aáâ]nic[oa]/i) ||
                       normalizedTitle.match(/bioc[ea][aáâ]nic[oa].{0,15}corredor/i);
    
    // Términos adicionales relevantes
    const additionalRelevantTerms = [
      'vial', 
      'interoceanico', 
      'interoceánico', 
      'interoceanica', 
      'interoceánica',
      'eixo bioceânico',
      'carretera interoceánica',
      'corredor central',
      'corredor vial',
      'transoceanico', 
      'transoceánico',
      'ruta bioceánica',
    ];
    
    const containsAdditionalTerm = additionalRelevantTerms.some(term => normalizedTitle.includes(term.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    
    // Si contiene "corredor bioceánico" en la URL, darle un boost de relevancia
    if (hasCorredorInUrl) {
      score += 40;
      matchedKeywords.push('corredor-bioceánico-en-url');
    }
    
    // CONDICIÓN MEJORADA: Reducir la rigidez para detectar más variantes
    if (!(
        (titleContainsCorredor && titleContainsBioceanico) || 
        titleContainsRuta || 
        (titleContainsCorredor && titleContainsCapricornio) ||
        (titleContainsIntegracion && containsAdditionalTerm) ||
        titleContainsProyecto ||
        hasCorredorInUrl ||
        closeTerms
      )) {
      // Verificar si al menos menciona países relevantes y términos relacionados
      const countriesInTitle = CORRIDOR_KEYWORDS.paises.filter(country => 
        normalizedTitle.includes(country.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
      
      // Si menciona al menos 3 países del corredor y algún término relacionado, puede ser relevante
      if (countriesInTitle.length >= 3 && containsAdditionalTerm) {
        score += 30;
        matchedKeywords.push(...countriesInTitle);
        matchedKeywords.push('países-del-corredor');
      } else {
        return {
          isRelevant: false,
          score: 0,
          matchedKeywords: []
        };
      }
    }
    
    // 2. Si el título contiene los términos clave, asignar puntaje base alto
    score += 50;
    if (titleContainsCorredor) matchedKeywords.push('corredor');
    if (titleContainsBioceanico) matchedKeywords.push('bioceánico');
    if (titleContainsRuta) matchedKeywords.push('ruta bioceánica');
    if (titleContainsCapricornio) matchedKeywords.push('capricornio');
    if (titleContainsIntegracion) matchedKeywords.push('integración regional');
    if (titleContainsProyecto) matchedKeywords.push('proyecto del corredor');
    if (closeTerms) matchedKeywords.push('términos bioceánicos cercanos');
    
    if (containsAdditionalTerm) {
      additionalRelevantTerms.forEach(term => {
        const normalizedTerm = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedTitle.includes(normalizedTerm)) {
          matchedKeywords.push(term);
        }
      });
    }
    
    // 3. Verificar términos específicos de alto valor en el título
    const highValueTitleTerms = [
      'corredor bioceánico vial',
      'corredor bioceánico capricornio',
      'corredor bioceanico de capricornio',
      'corredor bioceânico de capricórnio',
      'carretera bioceánica',
      'rota bioceânica',
      'eje vial bioceánico',
      'puerto murtinho',
      'carmelo peralta',
      'complejo multimodal',
      'puente bioceánico',
      'túnel de agua negra',
      'tunel de agua negra',
      'paso de jama',
      'puerto de iquique',
      'puerto de antofagasta',
      'rodoviario',
      'rodoviária', 
      'comercio internacional',
      'comércio internacional',
      'proyecto del corredor bioceánico',
      'desarrollo del corredor bioceánico',
      'desarrollo del corredor bioceanico'
    ];
    
    for (const term of highValueTitleTerms) {
      const normalizedTerm = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedTitle.includes(normalizedTerm)) {
        matchedKeywords.push(term);
        score += 30; // Valor adicional por términos específicos en el título
        break;
      }
    }
    
    // 4. Verificar si el título menciona países relevantes
    let countryMatches = 0;
    for (const country of CORRIDOR_KEYWORDS.paises) {
      const normalizedCountry = country.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedTitle.includes(normalizedCountry)) {
        matchedKeywords.push(country);
        countryMatches++;
      }
    }
    
    // Valor adicional cuando menciona múltiples países conectados por el corredor
    if (countryMatches >= 2) {
      score += 25;
    } else {
      // Valor por mencionar países en el título
      score += Math.min(countryMatches * 10, 20);
    }

    // 5. Verificar contexto adicional en el snippet
    if (snippet && snippet.length > 10) {
      const normalizedSnippet = snippet.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // Si el snippet refuerza la relevancia con términos del corredor
      if (normalizedSnippet.includes('corredor') && 
          (normalizedSnippet.includes('bioceanico') || normalizedSnippet.includes('bioceánico'))) {
        score += 15;
        matchedKeywords.push('corredor-bioceánico-en-snippet');
      }
      
      // Si menciona países del corredor en el snippet
      const snippetCountries = CORRIDOR_KEYWORDS.paises.filter(country => 
        normalizedSnippet.includes(country.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
      
      if (snippetCountries.length >= 2) {
        score += 10;
        matchedKeywords.push('países-del-corredor-en-snippet');
      }
    }

    // Verificar si supera el umbral de 60%
    const isRelevant = score >= 60;
    
    return {
      isRelevant,
      score,
      matchedKeywords: Array.from(new Set(matchedKeywords)) // Eliminar duplicados
    };
  }
});

// =============================================
// SISTEMA DE GENERACIÓN DE RESUMENES
// =============================================
// Utiliza el modelo FalconsAI de Hugging Face para:
// 1. Reducir contenido a 2000 caracteres como máximo
// 2. Generar resumen coherente
// 3. Manejar fallos con estrategia de fallback en caso de error
async function generateSummary(content: string, title: string): Promise<string> {
  try {
    logger.info('=== INICIANDO HUGGINGFACE SUMMARIZATION ===');
    
    if (!process.env.HUGGINGFACE_API_KEY) {
      logger.error('HUGGINGFACE_API_KEY no está configurada');
      return content.split('.')[0].substring(0, 147) + '...';
    }

    const textToSummarize = content.length > 2000 
      ? content.substring(0, 2000) 
      : content;

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

  } catch (error) {
    logger.error('Error en HuggingFace:', error);
    const sentences = content.split(/[.!?]+/)
      .filter(s => s.trim().length > 0)
      .filter(s => s.toLowerCase().includes('corredor') || s.toLowerCase().includes('bioceánico'))
      .slice(0, 1);
    
    return sentences[0] ? sentences[0] + '.' : content.split('.')[0].substring(0, 147) + '...';
  }
}

// =============================================
// VALIDACIÓN DE CONTENIDO
// =============================================
// Sistema de reglas para determinar si el contenido es válido:
// 1. Longitud mínima de texto
// 2. Número de párrafos
// 3. Presencia de palabras clave clave
// 4. Detección de contenido duplicado
function isValidContent(content: string, url: string): ContentValidationResult {
  // Sitios oficiales tienen reglas más permisivas
  const isOfficialSite = OFFICIAL_DOMAINS.some(domain => url.includes(domain));
  console.log(`Validando contenido para ${url} (Sitio oficial: ${isOfficialSite ? 'Sí' : 'No'})`);

  // Para sitios oficiales, solo verificamos que tenga contenido mínimo
  if (isOfficialSite) {
    const hasContent = content.length > 100;
    if (!hasContent) {
      console.log(`❌ Sitio oficial con contenido vacío o demasiado corto: ${url}`);
    } else {
      console.log(`✅ Sitio oficial con contenido válido: ${url}`);
    }
    return {
      isValid: hasContent,
      reasons: hasContent ? [] : ['Contenido vacío o demasiado corto para sitio oficial']
    };
  }

  // Para otros sitios, validación completa
  const reasons: string[] = [];
  const validationPoints: string[] = [];
  
  // Validar longitud mínima
  if (content.length < 300) {
    reasons.push('Contenido demasiado corto (menos de 300 caracteres)');
  } else {
    validationPoints.push('Longitud mínima OK');
  }
  
  // Validar párrafos suficientes
  const paragraphs = content.split(/\n\n|\r\n\r\n|\.(?=\s)/g)
    .filter(p => p.trim().length > 0)
    .filter(p => !p.startsWith('**'));
    
  if (paragraphs.length < 2) {
    reasons.push('Contenido insuficiente: menos de 2 párrafos');
  } else {
    validationPoints.push(`Párrafos suficientes (${paragraphs.length})`);
  }

  // Validar proporción de citas
  const quotesCount = (content.match(/["'"]/g) || []).length;
  if (quotesCount > content.length * 0.4) {
    reasons.push('Exceso de citas textuales');
  }

  // Validar presencia de palabras clave
  const contentLower = content.toLowerCase();
  const keywordsFound = {
    nombres: CORRIDOR_KEYWORDS.nombres.filter(word => contentLower.includes(word.toLowerCase())),
    paises: CORRIDOR_KEYWORDS.paises.filter(word => contentLower.includes(word.toLowerCase())),
    tags: CORRIDOR_KEYWORDS.temas.filter(word => contentLower.includes(word.toLowerCase()))
  };

  if (keywordsFound.nombres.length < 1) {
    reasons.push('No menciona el corredor específicamente');
  } else {
    validationPoints.push(`Menciona el corredor (${keywordsFound.nombres.join(', ')})`);
  }
  
  if (keywordsFound.paises.length < 1) {
    reasons.push('No menciona ningún país involucrado');
  } else {
    validationPoints.push(`Menciona países (${keywordsFound.paises.join(', ')})`);
  }
  
  if (keywordsFound.tags.length < 1) {
    reasons.push('No menciona temas relacionados al corredor');
  } else {
    validationPoints.push(`Menciona temas relacionados (${keywordsFound.tags.join(', ')})`);
  }

  // Decisión final de validez
  const isValid = reasons.length === 0;
  
  // Loguear resultados detallados
  if (isValid) {
    console.log(`✅ Contenido válido para ${url}:`);
    validationPoints.forEach(point => console.log(`  - ${point}`));
  } else {
    console.log(`❌ Contenido inválido para ${url}:`);
    reasons.forEach(reason => console.log(`  - ${reason}`));
  }

  return { isValid, reasons };
}

async function getSearchResults(searchTerm: string, start: number = 1, country?: string): Promise<SearchResult[]> {
  const currentKey = API_KEYS[currentKeyIndex];
  
  try {
    console.log(`Realizando búsqueda para: "${searchTerm}" (página ${start/10 + 1})${country ? ` en país: ${country.toUpperCase()}` : ''}`);
    
    // Configuración simplificada con solo los parámetros necesarios
    const params: any = {
      key: currentKey,
      cx: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
      q: searchTerm,
      num: 10,
      start: start,
      sort: 'date',
      dateRestrict: 'd7'
    };
    
    // Añadir restricción de país si está especificada
    if (country) {
      const countryMapping: {[key: string]: string} = {
        'cl': 'countryCL',    // Chile
        'py': 'countryPY',    // Paraguay
        'br': 'countryBR',    // Brasil
        'ar': 'countryAR',    // Argentina
        'bo': 'countryBO'     // Bolivia
      };
      
      if (countryMapping[country.toLowerCase()]) {
        params.cr = countryMapping[country.toLowerCase()];
      }
    }
    
    // Aplicar exclusión de sitios
    if (scraperConfig.excludedSites) {
      params.siteSearch = scraperConfig.excludedSites;
      params.siteSearchFilter = 'e';  // 'e' significa excluir estos sitios
    }
    
    console.log('Parámetros de búsqueda:', JSON.stringify(params));
    
    const response = await axiosInstance.get('https://www.googleapis.com/customsearch/v1', { params });

    if (response.status === 429 || response.status === 403) {
      console.log(`Límite de API alcanzado. Rotando a la siguiente clave: ${currentKeyIndex + 1}`);
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      return getSearchResults(searchTerm, start, country);
    }
    
    if (!response.data || !response.data.items) {
      return [];
    }

    const items = response.data.items || [];
    console.log(`Encontrados ${items.length} resultados para "${searchTerm}"`);
    
    return items;
  } catch (error) {
    logger.error(`Error en búsqueda: ${error.message}`);
    
    if (error.response?.status === 429 || error.response?.status === 403) {
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      return getSearchResults(searchTerm, start, country);
    }
    
    return [];
  }
}

async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axiosInstance.get(url);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

/**
 * Verifica si una URL parece ser una página de artículo específico y no
 * una página de categoría, sección, autor o página principal
 * @param url URL a verificar
 * @returns true si la URL parece ser un artículo específico
 */
function isValidArticleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    
    // Eliminar barras iniciales y finales
    const path = pathname.replace(/^\/|\/$/g, '');
    
    // Si el path está vacío, es la página principal
    if (path === '') {
      return false;
    }
    
    // Comprobar si es una URL de categoría o sección común
    const commonSectionPaths = [
      'politica', 'política', 'noticias', 'actualidad', 'nacional', 'nacionales',
      'internacional', 'internacionales', 'economia', 'economía', 'deportes',
      'sociedad', 'cultura', 'opinion', 'opinión', 'tecnologia', 'tecnología',
      'ciencia', 'salud', 'educacion', 'educación', 'espectaculos', 'espectáculos',
      'entretenimiento', 'mundo', 'region', 'regional', 'provinciales', 'locales',
      'ultimas-noticias', 'ultimas', 'destacadas', 'tendencias', 'virales',
      'home', 'index', 'inicio', 'portada', 'cover', 'principal', 'main'
    ];
    
    // Verificar si la URL es solo una sección/categoría sin más partes específicas
    if (commonSectionPaths.includes(path.toLowerCase())) {
      return false;
    }
    
    // Verificar patrones de URLs de categoría/sección
    if (/^(category|categoria|seccion|section|tag|autor|author|page|pagina)\/[^\/]+\/?$/.test(path)) {
      return false;
    }
    
    // Verificar patrones de paginación
    if (/^page\/\d+\/?$/.test(path) || path.includes('/page/')) {
      return false;
    }
    
    // URLs que terminan en números de página también suelen ser listados
    if (/\/\d+\/?$/.test(path) && path.split('/').length < 3) {
      return false;
    }
    
    // Verificar patrones de URLs de autor
    if (path.includes('/author/') || path.startsWith('author/')) {
      return false;
    }
    
    // URLs muy cortas con solo un segmento suelen ser secciones
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 1 && segments[0].length < 12 && !segments[0].includes('-')) {
      return false;
    }
    
    // Características positivas que indican que es un artículo
    const hasArticleIndicators = 
      // Tiene fecha en formato YYYY/MM/DD o YYYY-MM-DD
      /\d{4}\/\d{1,2}\/\d{1,2}/.test(path) || 
      /\d{4}-\d{1,2}-\d{1,2}/.test(path) ||
      // Tiene palabras clave de artículo
      /article|articulo|noticia|nota|news|post|entry/.test(path) ||
      // Tiene ID numérico de artículo
      /item\/\d+|id=\d+|article-\d+|post-\d+|noticia\/\d+/.test(url) ||
      // Tiene slugs largos descriptivos con guiones (típico de artículos)
      (segments.length > 0 && segments[segments.length-1].includes('-') && segments[segments.length-1].length > 15);
    
    // Si tiene algún indicador fuerte de artículo, considerarlo válido
    if (hasArticleIndicators) {
      return true;
    }
    
    // Para URLs que no caen en los casos anteriores, verificar si no son muy cortas
    // y tienen alguna estructura compleja (probabilidad de que sea un artículo)
    return (segments.length >= 2 || (segments.length === 1 && segments[0].length > 15));
    
  } catch (error) {
    logger.error(`Error analizando URL ${url}:`, error);
    return false;
  }
}

// Función auxiliar para extraer la URL real del HTML de Google News
function extractRealUrlFromGoogleNews(html, originalUrl) {
  try {
    // 1. Nueva estrategia: extraer URL del script JSON-LD (muy efectivo)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.url && jsonData.url !== originalUrl && !jsonData.url.includes('news.google.com')) {
          console.log('✅ URL encontrada en JSON-LD');
          return jsonData.url;
        }
      } catch (e) {
        console.log('Error parseando JSON-LD:', e.message);
      }
    }
    
    // 2. Buscar por data-n-au (método original)
    const auMatch = html.match(/data-n-au="([^"]+)"/);
    if (auMatch && auMatch[1]) {
      return auMatch[1];
    }
    
    // 3. Nueva estrategia: buscar URL en meta canonical
    const canonicalMatch = html.match(/<link[^>]+?rel=["']canonical["'][^>]+?href=["']([^"']+)["']/i);
    if (canonicalMatch && canonicalMatch[1] && !canonicalMatch[1].includes('news.google.com')) {
      console.log('✅ URL encontrada en canonical');
      return canonicalMatch[1];
    }
    
    // 4. Nueva estrategia: buscar url en meta og:url
    const ogUrlMatch = html.match(/<meta[^>]+?property=["']og:url["'][^>]+?content=["']([^"']+)["']/i);
    if (ogUrlMatch && ogUrlMatch[1] && !ogUrlMatch[1].includes('news.google.com')) {
      console.log('✅ URL encontrada en og:url');
      return ogUrlMatch[1];
    }
    
    // 5. Buscar en c-wiz con rel="nofollow" (método original mejorado)
    const cwizMatch = html.match(/c-wiz[^>]*?>[\s\S]*?<a[^>]*?href=["']([^"']+)["'][^>]*?rel=["']nofollow["']/);
    if (cwizMatch && cwizMatch[1]) {
      return cwizMatch[1].startsWith('http') 
        ? cwizMatch[1] 
        : new URL(cwizMatch[1], 'https://news.google.com').href;
    }
    
    // 6. Buscar cualquier enlace con rel="nofollow" (método original)
    const relMatch = html.match(/<a[^>]*?href=["']([^"']+)["'][^>]*?rel=["']nofollow["']/);
    if (relMatch && relMatch[1]) {
      return relMatch[1].startsWith('http') 
        ? relMatch[1] 
        : new URL(relMatch[1], 'https://news.google.com').href;
    }
    
    // 7. Nueva estrategia: seguir redirecciones HTTP para obtener la URL final
    return null;
  } catch (error) {
    console.error('Error extrayendo URL real:', error);
    return null;
  }
}

// Nueva función para seguir redirecciones HTTP y obtener la URL final
async function followRedirects(url, maxRedirects = 5) {
  try {
    console.log(`Siguiendo redirecciones para: ${url}`);
    
    // Usar un User-Agent rotado
    const userAgent = getNextUserAgent();
    
    // Configurar Axios para no seguir redirecciones automáticamente
    const response = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: status => (status >= 200 && status < 300) || status === 301 || status === 302 || status === 303 || status === 307 || status === 308,
      timeout: 7000,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (maxRedirects <= 0) {
        console.log('Máximo número de redirecciones alcanzado');
        return url;
      }
      
      const nextUrl = response.headers.location.startsWith('http')
        ? response.headers.location
        : new URL(response.headers.location, url).href;
      
      console.log(`Redirección a: ${nextUrl}`);
      
      // Pequeña pausa aleatoria entre redirecciones
      const randomDelay = 200 + Math.floor(Math.random() * 300);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      
      return await followRedirects(nextUrl, maxRedirects - 1);
    }
    
    return url;
  } catch (error) {
    console.error(`Error siguiendo redirecciones: ${error.message}`);
    return url;
  }
}

// Reemplazar la función completa de resolveGoogleNewsLinks
async function resolveGoogleNewsLinks(links) {
  const puppeteer = require('puppeteer');
  const resolvedLinks = [];
  
  console.log(`Iniciando resolución de ${links.length} enlaces...`);
  
  // Estadísticas de resolución
  const stats = {
    totalLinks: links.length,
    method1Success: 0,
    method15Success: 0,
    method2Success: 0,
    method3Success: 0,
    failed: 0
  };
  
  // PRIMERA FASE: Intentar resolver URLs directamente con Axios
  const unresolvedLinks = [];
  
  for (const item of links) {
    try {
      // Usar un user agent rotado
      const userAgent = getNextUserAgent();
      console.log(`Método 1: Intentando resolver ${item.googleNewsUrl.substring(0, 40)}...`);
      
      // Intentar obtener la URL real desde el HTML de Google News
      const response = await axiosInstance.get(item.googleNewsUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      // Intentar extraer URL real del HTML
      let realUrl = extractRealUrlFromGoogleNews(response.data, item.googleNewsUrl);
      
      // Si no se pudo extraer del HTML, intentar seguir redirecciones HTTP
      if (!realUrl) {
        console.log('Método 1.5: Intentando seguir redirecciones HTTP...');
        realUrl = await followRedirects(item.googleNewsUrl);
        
        // Solo considerar válida si no es la URL original y no es de Google News
        if (realUrl === item.googleNewsUrl || realUrl.includes('news.google.com')) {
          realUrl = null;
        } else {
          console.log(`✅ URL resuelta (Método 1.5): ${realUrl}`);
          stats.method15Success++;
        }
      } else {
        console.log(`✅ URL resuelta (Método 1): ${realUrl}`);
        stats.method1Success++;
      }
      
      if (realUrl && realUrl !== item.googleNewsUrl) {
        const domain = new URL(realUrl).hostname;
        resolvedLinks.push({
          title: item.title,
          link: realUrl,
          originalLink: item.googleNewsUrl,
          sourceName: item.source || domain,
          sourceDomain: domain,
          publishedDate: item.pubDate,
          searchTerm: item.searchTerm
        });
      } else {
        // MÉTODO 3 (NUEVO): Intentar resolución con otro User-Agent
        console.log('Método 3: Intentando con otro User-Agent...');
        const alternativeAgent = getNextUserAgent();
        
        try {
          const altResponse = await axiosInstance.get(item.googleNewsUrl, {
            headers: {
              'User-Agent': alternativeAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7', // Otro idioma
              'Referer': 'https://www.google.com/'
            },
            timeout: 8000 
          });
          
          realUrl = extractRealUrlFromGoogleNews(altResponse.data, item.googleNewsUrl);
          
          if (realUrl && realUrl !== item.googleNewsUrl && !realUrl.includes('news.google.com')) {
            console.log(`✅ URL resuelta (Método 3): ${realUrl}`);
            stats.method3Success++;
            
            const domain = new URL(realUrl).hostname;
            resolvedLinks.push({
              title: item.title,
              link: realUrl,
              originalLink: item.googleNewsUrl,
              sourceName: item.source || domain,
              sourceDomain: domain,
              publishedDate: item.pubDate,
              searchTerm: item.searchTerm
            });
            continue;
          }
        } catch (altError) {
          console.error(`❌ Error método 3: ${altError.message}`);
        }
        
        // No se pudo extraer, usar método 2
        unresolvedLinks.push(item);
      }
    } catch (error) {
      console.error(`❌ Error método 1: ${error.message}`);
      unresolvedLinks.push(item);
    }
    
    // Pequeña pausa entre peticiones con tiempo aleatorio
    const randomDelay = 300 + Math.floor(Math.random() * 500);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
  }
  
  console.log(`Métodos iniciales completados. Resueltos: ${resolvedLinks.length}/${links.length}. Pendientes: ${unresolvedLinks.length}`);
  
  // SEGUNDA FASE: Intentar con Puppeteer para los enlaces no resueltos
  if (unresolvedLinks.length > 0) {
    console.log("Iniciando método 2 (Puppeteer) para los enlaces restantes...");
    
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
        timeout: 30000
      });
      
      // Procesar en grupos pequeños para evitar problemas de memoria
      const batchSize = 3; // Reducido para mayor estabilidad
      for (let i = 0; i < unresolvedLinks.length; i += batchSize) {
        const batch = unresolvedLinks.slice(i, i + batchSize);
        
        // Procesamiento SECUENCIAL para mayor estabilidad
        for (const item of batch) {
          const page = await browser.newPage();
          await page.setDefaultNavigationTimeout(20000);
          
          // Establecer user agent rotado para cada página
          await page.setUserAgent(getNextUserAgent());
          
          try {
            console.log(`Método 2: Intentando resolver ${item.googleNewsUrl.substring(0, 40)}...`);
            
            // Mejorar detección de redirecciones
            let finalUrl = null;
            
            // Evento para capturar redirecciones
            await page.setRequestInterception(true);
            page.on('request', request => {
              if (request.isNavigationRequest() && request.redirectChain().length) {
                finalUrl = request.url();
              }
              request.continue();
            });
            
            // Navegar a la página y esperar redirecciones
            await page.goto(item.googleNewsUrl, {
              waitUntil: 'networkidle2',
              timeout: 15000
            });
            
            // Esperar por posibles redirecciones JavaScript
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Si no se capturó en el evento, obtener la URL final del navegador
            if (!finalUrl) {
              finalUrl = page.url();
            }
            
            // Verificar si ya no estamos en Google News
            if (finalUrl !== item.googleNewsUrl && !finalUrl.includes('news.google.com')) {
              console.log(`✅ URL resuelta (Método 2): ${finalUrl}`);
              stats.method2Success++;
              
              const domain = new URL(finalUrl).hostname;
              resolvedLinks.push({
                title: item.title,
                link: finalUrl,
                originalLink: item.googleNewsUrl,
                sourceName: item.source || domain,
                sourceDomain: domain,
                publishedDate: item.pubDate,
                searchTerm: item.searchTerm
              });
            } else {
              // Intentar extraer la URL del contenido de la página como último recurso
              let extractedUrl = null;
              
              try {
                // Buscar enlace con atributo data-n-au
                const articleEl = await page.$('[data-n-au]');
                if (articleEl) {
                  extractedUrl = await articleEl.evaluate(el => el.getAttribute('data-n-au'));
                }
                
                // Si no se encontró, buscar enlace canónico
                if (!extractedUrl) {
                  const canonicalEl = await page.$('link[rel="canonical"]');
                  if (canonicalEl) {
                    const href = await canonicalEl.evaluate(el => el.getAttribute('href'));
                    if (href && !href.includes('news.google.com')) {
                      extractedUrl = href;
                    }
                  }
                }
                
                // Si aún no hay URL, buscar enlaces específicos de Google News
                if (!extractedUrl) {
                  const newsLinkEl = await page.$('.DY5T1d');
                  if (newsLinkEl) {
                    extractedUrl = await newsLinkEl.evaluate(el => el.getAttribute('href'));
                  }
                }
              } catch (evalError) {
                console.error(`Error evaluando elementos DOM: ${evalError.message}`);
              }
              
              // Si aún no hay URL, intentar hacer clic en el primer enlace relevante
              if (!extractedUrl) {
                try {
                  // Encontrar enlaces rel="nofollow"
                  const noFollowLinks = await page.$$('a[rel="nofollow"]');
                  if (noFollowLinks.length > 0) {
                    // Hacer clic en el primer enlace
                    await noFollowLinks[0].click();
                    
                    // Esperar a que se complete la navegación
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Obtener URL después del clic
                    finalUrl = page.url();
                    if (finalUrl !== item.googleNewsUrl && !finalUrl.includes('news.google.com')) {
                      extractedUrl = finalUrl;
                    }
                  }
                } catch (clickError) {
                  console.error(`Error haciendo clic: ${clickError.message}`);
                }
              }
              
              if (extractedUrl) {
                // Normalizar URL si es relativa
                const absoluteUrl = extractedUrl.startsWith('http') 
                  ? extractedUrl 
                  : new URL(extractedUrl, 'https://news.google.com').href;
                
                console.log(`✅ URL resuelta (Método 2 - DOM): ${absoluteUrl}`);
                stats.method2Success++;
                
                const domain = new URL(absoluteUrl).hostname;
                resolvedLinks.push({
                  title: item.title,
                  link: absoluteUrl,
                  originalLink: item.googleNewsUrl,
                  sourceName: item.source || domain,
                  sourceDomain: domain,
                  publishedDate: item.pubDate,
                  searchTerm: item.searchTerm
                });
              } else {
                console.log(`❌ No se pudo resolver: ${item.googleNewsUrl}`);
                stats.failed++;
                
                // Como último recurso, agregar el enlace original para mantener la información
                resolvedLinks.push({
                  title: item.title,
                  link: item.googleNewsUrl, // Mantener el enlace original como fallback
                  originalLink: item.googleNewsUrl,
                  sourceName: item.source || 'news.google.com',
                  sourceDomain: 'news.google.com',
                  publishedDate: item.pubDate,
                  searchTerm: item.searchTerm
                });
              }
            }
          } catch (error) {
            console.error(`❌ Error método 2: ${error.message}`);
            stats.failed++;
            
            // Agregar el enlace original como fallback
            resolvedLinks.push({
              title: item.title,
              link: item.googleNewsUrl,
              originalLink: item.googleNewsUrl,
              sourceName: item.source || 'news.google.com',
              sourceDomain: 'news.google.com',
              publishedDate: item.pubDate,
              searchTerm: item.searchTerm
            });
          } finally {
            // Asegurarse de que la página se cierre adecuadamente
            try {
              if (page && !page.isClosed()) {
                await page.close();
              }
            } catch (e) {
              console.error('Error cerrando página:', e);
            }
          }
          
          // Pausa entre páginas para estabilidad
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      await browser.close();
    } catch (browserError) {
      console.error(`Error iniciando navegador: ${browserError.message}`);
    }
  }
  
  // Mostrar estadísticas de resolución
  console.log(`\n=== ESTADÍSTICAS DE RESOLUCIÓN DE ENLACES ===`);
  console.log(`Total de enlaces procesados: ${stats.totalLinks}`);
  console.log(`✅ Resueltos por Método 1 (HTML): ${stats.method1Success} (${Math.round(stats.method1Success/stats.totalLinks*100)}%)`);
  console.log(`✅ Resueltos por Método 1.5 (Redirecciones): ${stats.method15Success} (${Math.round(stats.method15Success/stats.totalLinks*100)}%)`);
  console.log(`✅ Resueltos por Método 2 (Puppeteer): ${stats.method2Success} (${Math.round(stats.method2Success/stats.totalLinks*100)}%)`);
  console.log(`✅ Resueltos por Método 3 (Alt User-Agent): ${stats.method3Success} (${Math.round(stats.method3Success/stats.totalLinks*100)}%)`);
  console.log(`❌ No resueltos: ${stats.failed} (${Math.round(stats.failed/stats.totalLinks*100)}%)`);
  console.log(`Tasa de éxito total: ${Math.round((stats.method1Success + stats.method15Success + stats.method2Success + stats.method3Success)/stats.totalLinks*100)}%`);
  
  return resolvedLinks;
}

