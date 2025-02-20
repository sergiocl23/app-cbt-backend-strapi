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

// =============================================
// CONFIGURACIONES
// =============================================
const SEARCH_CONFIG = {
  maxArticlesPerTerm: 20,
  maxTotalArticles: 50,
  batchDays: 180,
  searchTerms: [
    'Corredor Bioceánico Chile Paraguay Brasil',
    'Corredor Bioceánico Vial noticias',
    'Corredor Bioceânico Brasil Chile Paraguai',
    'Corredor Rodoviário Bioceânico',
    'Rota Bioceânica Brasil',
    'Porto Murtinho Corredor Bioceânico',
    'Integração Brasil Chile Paraguai',
    'Corredor Bioceánico Mato Grosso do Sul',
    'Corredor Bioceánico Campo Grande',
    'Corredor Bioceánico Porto Murtinho',
    'Corredor Bioceánico Alto Hospicio',
    'Corredor Bioceánico Iquique Tarapacá',
    'Corredor Bioceánico Antofagasta',
    'Corredor Bioceánico MOPC Paraguay',
    'Corredor Bioceánico Ministerio Obras',
    'Corredor Bioceánico Hacienda Chile'
  ],
  searchParams: {
    dateRestrict: 'w2',
    sort: 'date',
    exactTerms: 'Corredor Bioceánico|Corredor Bioceânico',
    dateSort: 'r',
    filter: '1',
    lr: 'lang_es|lang_pt',  
    cr: 'countryBR|countryCL|countryPY|countryAR',
    siteSearch: [
      'gov.br',
      'infraestrutura.gov.br',
      'correiodopovo.com.br',
      'gazetadopovo.com.br',
      'folha.uol.com.br',
      'campogrande.ms.gov.br',
      'ms.gov.br',
      'edicioncero.cl',
      'reporteminero.cl',
      'agenciaip.com',
      'peruconstruye.net',
      'losandes.com.ar',
      'gob.pe',
      'radio45sur.cl',
      'hacienda.cl',
      'aduananews.com'
    ].join('|')
  },
  excludedSites: 'facebook.com|twitter.com|instagram.com|linkedin.com|youtube.com|tiktok.com'
};

const API_KEYS = [
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_2,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_3,
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY_4
];

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
    'integración',
    'integração',
    'comercio',
    'comércio',
    'transporte',
    'infraestructura',
    'infraestrutura',
    'logística',
    'desarrollo',
    'desenvolvimento'
  ]
};

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
  async scrapeNews(searchTerm = "Corredor Bioceanico") {
    try {
      // Fase 1: Búsqueda de noticias
      logger.info('=== INICIANDO SCRAPING DE NOTICIAS ===');
      const results = await this.searchNews(searchTerm);
      
      // Fase 2: Procesamiento de resultados
      const savedArticles = [];
      const failedDomains = [];
      
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
          
          // Validación de contenido extraído
          if (!articleData) {
            failedDomains.push(result.link);
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

      // Reporte final de dominios no procesados
      if (failedDomains.length > 0) {
        logger.warn('=== DOMINIOS NO IMPLEMENTADOS ===');
        console.table(failedDomains.map(url => ({ 
          URL: url, 
          Dominio: new URL(url).hostname 
        })));
      }

      return savedArticles;
    } catch (error) {
      logger.error('Error en el scraping general:', error);
      throw error;
    }
  },

  // =============================================
  // BÚSQUEDA INTELIGENTE DE NOTICIAS
  // =============================================
  // Utiliza la API de Google Custom Search con:
  // - Rotación automática de API Keys
  // - Paginación de resultados
  // - Filtros por fecha y sitios específicos
  async searchNews(searchTerm?: string): Promise<SimpleSearchResult[]> {
    try {
      logger.info('Iniciando búsqueda de noticias...');
      const allResults: SimpleSearchResult[] = [];
      const termsToSearch = searchTerm ? [searchTerm] : SEARCH_CONFIG.searchTerms;

      for (const term of termsToSearch) {
        let start = 1;
        while (allResults.length < SEARCH_CONFIG.maxArticlesPerTerm) {
          const results = await getSearchResults(term, start);
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

      return Array.from(new Map(allResults.map(item => [item.link, item])).values())
        .sort((a, b) => {
          if (a.publishedTime && b.publishedTime) {
            return new Date(b.publishedTime).getTime() - new Date(a.publishedTime).getTime();
          }
          return 0;
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
  async extractArticleData(url: string, articleData?: SimpleSearchResult) {
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
  const isOfficialSite = OFFICIAL_DOMAINS.some(domain => url.includes(domain));
  
  if (isOfficialSite) {
    const hasContent = content.length > 100;
    return {
      isValid: hasContent,
      reasons: hasContent ? [] : ['Contenido vacío']
    };
  }

  const reasons: string[] = [];
  
  if (content.length < 500) reasons.push('Contenido demasiado corto');
  
  const paragraphs = content.split(/\n\n|\r\n\r\n|\.(?=\s)/g)
    .filter(p => p.trim().length > 0)
    .filter(p => !p.startsWith('**'));
    
  if (paragraphs.length < 3) reasons.push('Contenido insuficiente: menos de 3 párrafos');

  const quotesCount = (content.match(/["'"]/g) || []).length;
  if (quotesCount > content.length * 0.4) reasons.push('Exceso de citas textuales');

  const contentLower = content.toLowerCase();
  const keywordsFound = {
    nombres: CORRIDOR_KEYWORDS.nombres.filter(word => contentLower.includes(word.toLowerCase())),
    paises: CORRIDOR_KEYWORDS.paises.filter(word => contentLower.includes(word.toLowerCase())),
    tags: CORRIDOR_KEYWORDS.temas.filter(word => contentLower.includes(word.toLowerCase()))
  };

  if (keywordsFound.nombres.length < 1) reasons.push('No menciona el corredor específicamente');
  if (keywordsFound.paises.length < 1) reasons.push('No menciona ningún país involucrado');
  if (keywordsFound.tags.length < 1) reasons.push('No menciona temas relacionados al corredor');

  return { isValid: reasons.length === 0, reasons };
}

async function getSearchResults(searchTerm: string, start: number = 1): Promise<SearchResult[]> {
  const currentKey = API_KEYS[currentKeyIndex];
  
  try {
    const response = await axiosInstance.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: currentKey,
        cx: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
        q: searchTerm,
        dateRestrict: `d${SEARCH_CONFIG.batchDays}`,
        num: 10,
        start: start,
        sort: 'date',
        exactTerms: 'Corredor Bioceánico',
        dateSort: 'r',
        filter: '1'
      }
    });

    if (response.status === 429 || response.status === 403) {
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      return getSearchResults(searchTerm, start);
    }

    return response.data.items || [];
  } catch (error) {
    logger.error(`Error en búsqueda: ${error.message}`);
    if (error.response?.status === 429 || error.response?.status === 403) {
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      return getSearchResults(searchTerm, start);
    }
    throw error;
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

