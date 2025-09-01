import * as cheerio from 'cheerio';
import { parse, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================
// INTERFACES Y TIPOS
// =============================================
interface SiteSelector {
  urlPatterns: RegExp[];
  title: string[];
  content: string[];
  date: string[];
  image: string[];
  country: string;
  video?: string[];
  priority?: (url: string) => number;
  dateParser?: (dateText: string) => Date | string | null;
  dateFormats?: string[];
  exclude?: string[];
}

interface SiteSelectors {
  [domain: string]: SiteSelector;
}

// =============================================
//  CONFIGURACIONES
// =============================================
const selectorCache = new Map<string, SiteSelector>();
const CACHE_DURATION = 3600000; 

export const getSelectorsForDomain = (url: string): SiteSelector | null => {
  const domain = new URL(url).hostname;
  
  if (selectorCache.has(domain)) {
    return selectorCache.get(domain);
  }
  
  const matches = Object.entries(siteSelectors)
    .filter(([key]) => domain.includes(key))
    .sort((a, b) => {
      const priorityA = a[1].priority?.(url) || 0;
      const priorityB = b[1].priority?.(url) || 0;
      return priorityB - priorityA;
    });

  const selector = matches[0]?.[1] || null;
  
  selectorCache.set(domain, selector);
  setTimeout(() => selectorCache.delete(domain), CACHE_DURATION);
  
  return selector;
};

// Funcion helper para parsear fechas
const parseDate = (dateText: string, formats: string[] = []): Date | null => {
  if (!dateText) return null;

  console.log(`[DEBUG] Texto fecha original: ${dateText}`);

  const cleanDate = dateText.trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  console.log(`[DEBUG] Texto fecha limpio: ${cleanDate}`);

  // Formatos comunes en español usando date-fns
  const commonFormats = [
    'EEEE, d \'de\' MMMM \'de\' yyyy HH:mm',  // "Martes, 28 de enero de 2025 00:07"
    'd \'de\' MMMM \'de\' yyyy, HH:mm',       // "16 de enero de 2025, 10:59"
    'EEEE, d \'de\' MMMM \'de\' yyyy',        // "Martes, 28 de enero de 2025"
    'd \'de\' MMMM \'de\' yyyy',              // "28 de enero de 2025"
    'dd/MM/yyyy',                             // "29/01/2025"
    'dd-MM-yyyy',                             // "29-01-2025"
    'yyyy-MM-dd',                             // "2025-01-29"
    'MMMM d, yyyy',                           // "enero 29, 2025"
    'yyyy-MM-dd\'T\'HH:mm:ss.SSSX'           // ISO format
  ];

  // Combinar formatos proporcionados con los comunes
  const allFormats = [...formats, ...commonFormats];

  // Intentar cada formato
  for (const dateFormat of allFormats) {
    try {
      const parsed = parse(cleanDate, dateFormat, new Date(), {
        locale: es
      });
      
      if (isValid(parsed)) {
        return parsed;
      }
    } catch (e) {
      continue;
    }
  }

  // Si no funciono ningun formato, intentar con Date.parse
  try {
    const parsed = new Date(dateText);
    if (isValid(parsed)) {
      return parsed;
    }
  } catch (e) {
    // Ignorar error
  }

  console.log(` Formato de fecha no manejado: ${dateText}`);
  return null;
};

// Función para extraer y parsear la fecha
export const extractDate = async (
  $: cheerio.CheerioAPI,
  selectors: string[],
  dateFormats: string[] = [],
  siteConfig?: SiteSelector
): Promise<Date | null> => {
  let extractedDate: string | null = null;

  // Buscar en los selectores proporcionados
  for (const selector of selectors) {
    const element = $(selector).first();
    extractedDate = element.attr('datetime') || 
                   element.attr('content') ||   
                   element.text();              
    
    if (extractedDate) {
      console.log(`[DEBUG][extractDate] Fecha encontrada en selector ${selector}:`, extractedDate);
      break;
    }
  }

  if (!extractedDate) {
    const metaSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="publication-date"]',
      'meta[name="date"]'
    ];

    for (const selector of metaSelectors) {
      const content = $(selector).attr('content');
      if (content) {
        extractedDate = content;
        console.log(`[DEBUG][extractDate] Fecha encontrada en meta:`, extractedDate);
        break;
      }
    }
  }

  if (!extractedDate) {
    console.log(`[DEBUG][extractDate] No se encontró fecha en el HTML`);
    return null;
  }

  // Primero intentar con el dateParser específico del sitio
  if (siteConfig?.dateParser) {
    console.log(`[DEBUG][extractDate] Usando dateParser específico`);
    const parsedDate = siteConfig.dateParser(extractedDate);
    console.log(`[DEBUG][extractDate] Resultado dateParser específico:`, parsedDate);
    
    if (parsedDate) {
      try {
        if (typeof parsedDate === 'string') {
          const date = parse(parsedDate, 'd \'de\' MMMM \'de\' yyyy', new Date(), { locale: es });
          console.log(`[DEBUG][extractDate] Fecha parseada específica:`, date);
          return date;
        }
        return parsedDate;
      } catch (e) {
        console.log(`[DEBUG][extractDate] Error parseando con dateParser específico:`, e);
      }
    }
  }

  // Si no funciona, intentar con parseDate general
  console.log(`[DEBUG][extractDate] Intentando con parseDate general`);
  const generalParsedDate = parseDate(extractedDate, dateFormats);
  console.log(`[DEBUG][extractDate] Resultado parseDate general:`, generalParsedDate);
  
  return generalParsedDate;
};

export const extractContent = async (
  $: cheerio.CheerioAPI, 
  selectors: string[], 
  type: 'text' | 'html' = 'text'
): Promise<{ content: string }> => {
  const excludedSelectors = [
    '.adnuntius-ad', 
    '.relpost-thumb-wrapper',
    '.publi',
    '[class*="ad-"]',
    '.ads-box'
  ];

  for (const selector of selectors) {
    const elements = $(selector).not(excludedSelectors.join(', '));
    if (elements.length) {
      if (type === 'text') {
        const paragraphs = elements.map((_, element) => {
          const text = $(element).text().trim();
          return text.replace(/\s+/g, ' ').trim();
        }).get();

        const filteredParagraphs = paragraphs.filter(p => p.length > 0);
        const content = filteredParagraphs.join('\n\n');
        
        return { content };
      } else {
        return {
          content: elements.html()?.trim() || ''
        };
      }
    }
  }
  return { content: '' };
};

export const extractImage = (
  $: cheerio.CheerioAPI,
  selectors: string[],
  baseUrl: string
): string | null => {
  const prioritySources = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ];

  // Manejar URLs del ministerio con rutas relativas complejas
  const handleMinrelUrls = (url: string) => {
    if (url.startsWith('/minrel/site/artic')) {
      return `https://www.minrel.gob.cl${url}`;
    }
    return url;
  };

  // Primero verificar meta tags
  for (const metaSelector of prioritySources) {
    const metaImage = $(metaSelector).attr('content');
    if (metaImage) return handleMinrelUrls(metaImage);
  }

  // Luego los selectores específicos
  for (const selector of selectors) {
    const element = $(selector).first();
    let imgUrl = element.attr('src') || 
                 element.attr('data-src') || 
                 element.attr('data-srcset')?.split(' ')[0];

    if (imgUrl) {
      imgUrl = handleMinrelUrls(imgUrl);
      
      // Manejar URLs especiales del ministerio
      if (imgUrl.includes('/minrel/site/artic/')) {
        imgUrl = imgUrl.replace('/minrel/site/', '/site/');
      }

      try {
        return new URL(imgUrl, baseUrl).href;
      } catch {
        continue;
      }
    }
  }
  
  return null;
};


export const testUrl = (url: string): boolean => {
  try {
    const selectors = getSelectorsForDomain(url);
    return selectors !== null;
  } catch {
    return false;
  }
};

export const extractVideo = async (
  $: cheerio.CheerioAPI,
  selectors: string[]
): Promise<string | null> => {
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length) {
      const src = element.attr('src') || element.attr('data-src');
      if (src && src.includes('youtube.com/embed/')) {
        return src;
      }
    }
  }
  return null;
};


// Agregar lista de dominios oficiales
export const OFFICIAL_DOMAINS = [
  'gov.br',       // Brasil
  'gob.cl',       // Chile
  'mopc.gov.py',  // Paraguay
  'argentina.gob.ar' // Argentina
];

export const getCountryByDomain = (url: string): string => {
  const selector = getSelectorsForDomain(url);
  return selector?.country || 'chile'; // Default a Chile si no está definido
};

// Categorización
export const CATEGORIES = {
  tags: [
    { 
      id: 'infraestructura', 
      keywords: ['infraestructura', 'obras', 'construcción', 'carretera', 'puertos']
    },
    { 
      id: 'comercio', 
      keywords: ['comercio', 'exportación', 'importación', 'intercambio comercial', 'logística', 'carga'] 
    },
    { 
      id: 'integracion', 
      keywords: ['integración', 'cooperación', 'acuerdo', 'bilateral', 'desarrollo regional'] 
    },
    { 
      id: 'gobierno', 
      keywords: ['ministerio', 'gobierno', 'autoridades', 'reunión', 'comisión', 'política'] 
    }
  ],
};

export function categorizeContent(url: string, content: string): {
  tags: string[];
  pais: string;
} {
  const contentLower = content.toLowerCase();
  
  // Detectar tags basados en el contenido
  const tags = CATEGORIES.tags
    .filter(tag => 
      tag.keywords.some(kw => 
        contentLower.includes(kw.toLowerCase())
      )
    )
    .map(tag => tag.id);

  return {
    tags,
    pais: getCountryByDomain(url)
  };
} 

const siteSelectors: SiteSelectors = {
  // MOPC Paraguay
  'mopc.gov.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?mopc\.gov\.py\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?mopc\.gov\.py\/noticias\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?mopc\.gov\.py\/index\.php\/noticias\/[\w-]+$/,
      /^https?:\/\/(?:www\.)?mopc\.gov\.py\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'div.title h1.h-2',
      'h1.h-2',
      'article h1'
    ],
    content: [
      'article p:not(.su-image-carousel-caption):not(.footer-text):not(.copyright):not(:has(.share-actions))',
      'article > p:not(footer p):not(:has(.share-actions))',
      'article p:not(:has(.share-actions)):not(:has(.fa-facebook-f)):not(:has(.fa-instagram)):not(:has(.fa-twitter)):not(:has(.fa-youtube)):not(:has(.fa-flickr))'
    ],
    date: [
      'article time', 
      'article .date', 
      'article p:contains("Fecha:")', 
      'article .published'
    ],
    image: [
      'article .su-image-carousel-item img',
      'article .su-image-carousel img',
      'div.su-image-carousel-item-content a img'
    ],
    country: 'paraguay'
  },

  // Logística MTT Chile
  'logistica.mtt.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?logistica\.mtt\.cl\/[\w-]+\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?logistica\.mtt\.cl\/noticias\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?logistica\.mtt\.cl\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.elementor-heading-title',
      '.entry-title'
    ],
    content: [
      '.elementor-widget-text-editor p:not(.elementor-element-4d2640a *)',
      'article .elementor-widget-container > p:not(footer p, .elementor-element-4d2640a p)',
      '.elementor-text-editor p:not(.elementor-inner-section *)'
    ],
    date: [
      'span.elementor-post-info__item--type-date',
      '.elementor-post-info__item--type-date',
      '.entry-date'
    ],
    image: [
      'img.attachment-full',
      '.elementor-widget-theme-post-featured-image img'
    ],
    country: 'chile'
  },

  // Hacienda Chile - Cualquier noticia del ministerio
  'hacienda.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?hacienda\.cl\/noticias-y-eventos\/(?:noticias|comunicados)\/[\w-]+$/
    ],
    title: [
      'header h1',
      '.cuerpo h1'
    ],
    content: [
      'div.cuerpo p',
      '.cuerpo > p'
    ],
    date: [
      'header .fecha',
      'div.fecha'
    ],
    image: [
      'section.relacionadoPrincipal.imagen img',
      'header section.relacionadoPrincipal img'
    ],
    country: 'chile'
  },

  // Los Andes Argentina - Cualquier noticia del diario
  'losandes.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?losandes\.com\.ar\/[\w-]+\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?losandes\.com\.ar\/sociedad\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?losandes\.com\.ar\/economia\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?losandes\.com\.ar\/politica\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?losandes\.com\.ar\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'h1.h1',
      'h1.false.h1',
      '.article-title'
    ],
    content: [
      '.story .body section p:not(.container *):not(.cta-banner *):not(.story-tags *):not(.subscription-cta-body-bottom *)',
      '.story .body p:not(.container *):not(.subscription-cta-body-bottom *):not(.story-tags *):not(.banner-inner *)',
      'article .content p'
    ],
    date: [
      '.story-meta-datetime',
      '.story-meta-datetime .date',
      '.story-meta-datetime time',
      '.article-date'
    ],
    image: [
      '.story img[alt]:not(figure img):not(.banner-inner img)',
      'figure img:not(.banner-inner img)',
      '.article-image img'
    ],
    country: 'argentina'
  },

  // Selectores genéricos como fallback
  'default': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?[^.]+\.[^.]+\/?$/
    ],
    title: [
      'h1',
      'article h1',
      '.article-title',
      '.post-title',
      '.entry-title'
    ],
    content: [
      'div.desarrollo p:not([style*="font-size"])', // Ignorar párrafos con estilos inline
      'div.entry-content p:not(:has(strong))' // Evitar párrafos con texto en negrita
    ],
    date: [
      'time',
      '.date',
      '.published',
      'meta[property="article:published_time"]',
      '.post-date'
    ],
    image: [
      'article img',
      '.featured-image img',
      '.article-image img',
      'meta[property="og:image"]',
      '.post-thumbnail img'
    ],
    country: 'chile'
  },

  // Ministerio de Economía Chile
  'economia.gob.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?economia\.gob\.cl\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\.htm$/,
      /^https?:\/\/(?:www\.)?economia\.gob\.cl\/noticias\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?economia\.gob\.cl\/category\/noticias\/[\w-]+\/?$/
    ],
    title: [
      'div.col-lg-12 h1',
      '.col-lg-12 > h1'
    ],
    content: [
      'div.col-lg-12.pb-4 p',
      '.col-lg-12.pb-4 > p'
    ],
    date: [
      'div.col-lg-12.pt-0.pr-0.pb-0 p.text-muted',
      '.col-lg-12 .text-muted',
      'meta[property="article:published_time"]'
    ],
    image: [
      'div.col-lg-12.pb-4 img',
      '.col-lg-12.pb-4 > img',
      'meta[property="og:image"]'
    ],
    country: 'chile'
  },

  // Agencia IP Paraguay
  'ip.gov.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?ip\.gov\.py\/ip\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?ip\.gov\.py\/ip\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?ip\.gov\.py\/ip\/nacionales\/[\w-]+\/?$/
    ],
    title: [
      'h1.entry-title',
      'header.td-post-title h1'
    ],
    content: [
      'div.td-post-content p',
      '.td-post-content p:not(.heateor_sss_sharing_title)'
    ],
    date: [
      'time.entry-date',
      'span.td-post-date time'
    ],
    image: [
      'div.td-post-featured-image img',
      '.td-post-featured-image img.entry-thumb'
    ],
    country: 'paraguay'
  },

  // Iquique TV
  'iquiquetv.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?iquiquetv\.cl\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?iquiquetv\.cl\/[\w-]+\/?$/
    ],
    title: [
      'h1.entry-title',
      'header.td-post-title h1'
    ],
    content: [
      'div.td-post-content p',
      '.td-post-content.tagdiv-type p'
    ],
    date: [
      'time.entry-date',
      'span.td-post-date time'
    ],
    image: [
      '.entry-thumb',
      '.td-post-featured-image img'
    ],
    // Nuevo: selector para videos
    video: [
      '.wpb_video_wrapper iframe',
      '.wp-block-embed iframe'
    ],
    country: 'chile'
  },

  'lanacion.com.py': {
    country: 'paraguay',
    urlPatterns: [
      /^https?:\/\/(?:www\.)?lanacion\.com\.py\/[\w-]+\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?lanacion\.com\.py\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'div.headline h1',
      'h1.article-title',
      'h1.title',
      'div.article-header h1'
    ],
    content: [
      'div.pa-c p.paragraph:not(.ads-box *)',
      'article p:not(.ads-box *)',
      'div.article-body p:not(.ads-box *)',
      'div.article-text p:not(.ads-box *)'
    ],
    date: [
      'div.dt',
      'time.article-date',
      'div.article-date',
      'span.article-date'
    ],
    image: [
      'figure img.lci',
      'meta[property="og:image"]',
      'div.article-media img',
      'div.article-featured-image img'
    ]
  },

  // Logística 360 Chile
  'logistica360chile.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?logistica360chile\.cl\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?logistica360chile\.cl\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'h1.blogTitle',
      '.blogTitle'
    ],
    content: [
      'div.blogContent p',
      '.blogContent > p'
    ],
    date: [
      'div.subTitleDates h3',
      '.blogSubTitle .subTitleDates h3'
    ],
    image: [
      'div.blogImage img',
      '.blogImage img.wp-post-image'
    ],
    country: 'chile'
  },

  //  diariolongino.cl
  'diariolongino.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?diariolongino\.cl\/[\w-]+(?:\/[\w-]+)*\/?$/
    ],
    title: [
      'nav.brxe-breadcrumbs .item[aria-current="page"]',
      'h2.brxe-heading'
    ],
    content: [
      '#brxe-ee4e34 > p:not(#brxe-d20962):not([id^="brxe-"])',
      '#brxe-ee4e34 > p:not(.brxe-text-basic)'
    ],
    date: [
      '#brxe-fzxqhq',
      '#brxe-b8e885 span'
    ],
    image: [
      'figure.brxe-image img.css-filter[src*="uploads"]', 
      'img[srcset*="wp-content/uploads"]', 
      'figure.wp-block-image img[class*="wp-image-"]'
    ],
    country: 'chile'
  },

  // Argenports
  'argenports.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?argenports\.com\/nota\/[\w-]+\/?$/
    ],
    title: [
      '.elementor-widget-theme-post-title:not([data-id="6a6c09f"]):not([data-id="70e5190"]) h1.elementor-heading-title',
      '[data-widget_type="theme-post-title.default"]:not([data-id="6a6c09f"]):not([data-id="70e5190"]) h1'
    ],
    content: [
      '.elementor-widget-theme-post-content > .elementor-widget-container > p',
      '[data-widget_type="theme-post-content.default"] > .elementor-widget-container > p'
    ],
    date: [
      '.elementor-post-info__item--type-date time',
      '[data-widget_type="post-info.default"] time'
    ],
    image: [
      '.elementor-widget-theme-post-featured-image img.wp-image-28930',
      '[data-widget_type="theme-post-featured-image.default"] img.attachment-full'
    ],
    country: 'argentina'
  },

  // Aduana News
  'aduananews.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?aduananews\.com\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?aduananews\.com\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h1.tdb-title-text',
      '.tdb-title-text'
    ],
    content: [
      'div.tdb-block-inner.td-fix-index > p:not(:has(.m-a-box)):not(:has(.molongui-clearfix))',
      'div.tdb-block-inner.td-fix-index p:not(:has(script)):not(:has(.m-a-box-container))'
    ],
    date: [
      'time.entry-date',
      'time.entry-date.updated'
    ],
    image: [
      'img.entry-thumb',
      'img.wp-image-73359',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "14 enero, 2025"
      const match = dateText.match(/(\d{1,2})\s+([a-zé]+),\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        const meses = {
          'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
          'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        };
        const mesNum = meses[mes.toLowerCase()];
        if (mesNum) {
          return new Date(`${año}-${mesNum}-${dia.padStart(2, '0')}T00:00:00.000Z`);
        }
      }
      return null;
    },
    country: 'argentina'
  },

  // Infobae
  'infobae.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?infobae\.com\/[\w-]+\/[\w-]+\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?infobae\.com\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h1.article-headline',
      '#article-headline'
    ],
    content: [
      '.body-article p.paragraph',
      'p.paragraph[data-mrf-recirculation="Links inline"]'
    ],
    date: [
      '.sharebar-article-date',
      '.share-bar-article-date-container span'
    ],
    image: [
      '.visual__image img.global-image',
      '.body-article picture img'
    ],
    country: 'argentina'
  },

  // Portal Portuario
  'portalportuario.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?portalportuario\.cl\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?portalportuario\.cl\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'span.entry-title7',
      '.entry-header .entry-title7',
      'header.entry-header span.entry-title7'
    ],
    content: [
      '.entry-content p[style*="text-align: justify"]',
      '.entry-content > p[style*="text-align: justify"]:not(:has(.heateor_sss_sharing_container))',
      '.entry-content > p:not(:first-child):not(:nth-child(2)):not(:nth-child(3)):not(:has(.heateor_sss_sharing_container))'
    ],
    date: [
      'time.entry-date.published',
      '.below-entry-meta time'
    ],
    image: [
      '.entry-content img.size-medium',
      '.entry-content img.alignright',
      '.entry-content img.wp-image-239454',
      '.entry-content img[class*="wp-image"]',
      'meta[property="og:image"]'
    ],
    country: 'chile'
  },

  // Europa Press
  'europapress.es': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?europapress\.es\/[\w-]+\/[\w-]+\/noticia-[\w-]+\.html$/
    ],
    title: [
      'h1.titular[itemprop="headline"]',
      '.titularContainer h1'
    ],
    content: [
      '#CuerpoNoticiav2[itemprop="articleBody"] p:not(:empty)',
      '.NormalTextoNoticia p:not(:empty)'
    ],
    date: [
      '.div_title_Publicado',
      'div[class*="Publicado"]'
    ],
    image: [
      '#fotoPrincipalNoticia',
      '.schema_foto img[itemprop="image"]',
      'picture img[src*="europapress.es/fotoweb"]'
    ],
    country: 'Mundo'
  },

  // FM7 Chile
  'fm7.cl': {
    country: 'chile',
    urlPatterns: [
      /^https?:\/\/(?:www\.)?fm7\.cl\/noticias\/[\w-]+\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?fm7\.cl\/[\w-]+(?:\/[\w-]+)*\/?$/
    ],
    title: [
      'article h1.font-weight-lighter',
      'h1.font-weight-lighter'
    ],
    content: [
      'article .card-bodyz p',
      'div.card-bodyz p',
      '.cardx.video-responsive p'
    ],
    date: [
      'article ul.list-inline li:first-child a',
      'ul.list-inline .icon-calendar-6 + a'
    ],
    image: [
      'div.xv-slide[style*="background-image"]',
      'div.relative.xv-slide[data-bg-possition]',
      'img[src*="fm7.s3-accelerate.amazonaws.com"]'
    ],
    priority: (url: string) => {
      if (url.includes('/noticias/')) {
        return 2; 
      }
      return 1; 
    },
  },

  // Radio 45 Sur
  'radio45sur.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?radio45sur\.cl\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.jeg_post_title',
      'h1.jeg_post_title:not(:has(.jnews_inline_related_post *))'
    ],
    content: [
      // Seleccionar solo párrafos que son contenido directo
      '.content-inner > p:not(:has(.jnews_inline_related_post_wrapper)):not(:has(.jeg_post_tags)):not(:has(.jeg_share_button))',
      // Excluir específicamente los contenedores de contenido relacionado
      '.content-inner > p:not(:has(.jeg_postblock_28)):not(:has(.jeg_block_container))',
      // Excluir elementos que no son parte del contenido principal
      '.content-inner > p:not(:has(script)):not(:has(.jeg_post_title))',
      // Excluir párrafos que contienen solo imágenes o enlaces
      '.content-inner > p:not(:only-child):not(:empty):not(:has(img)):not(:has(script))'
    ],
    date: [
      // Seleccionar solo la fecha del artículo principal
      '.jeg_meta_container .jeg_meta_date a:first-of-type',
      // Backup selector más específico
      '.jeg_post_meta_1 .meta_left .jeg_meta_date a',
      // Excluir fechas de artículos relacionados
      '.jeg_meta_date a:not(.jnews_inline_related_post *):not(.jeg_postblock_28 *)'
    ],
    image: [
      'div.thumbnail-container img[data-src]',
      'meta[property="og:image"]'
    ],
    // Función para procesar la fecha y asegurar que solo se tome la primera
    dateParser: (dateText: string) => {
      const dates = dateText.split(' ').filter(text => /\d{2}\/\d{2}\/\d{4}/.test(text));
      return dates.length > 0 ? dates[0] : null;
    },
    country: 'chile'
  },

  // Vilas Radio
  'vilasradio.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?vilasradio\.cl\/[\w-]+\/?$/
    ],
    title: [
      'h1.post-title.entry-title',
      '.entry-header h1.post-title'
    ],
    content: [
      '.entry-content > p:not(.post-bottom-meta *)',
      '.entry-content.entry > p:not(.post-bottom-tags *):not(.post-bottom-meta *)'
    ],
    date: [
      '.single-post-meta .date.meta-item',
      '.post-meta .date'
    ],
    image: [
      '.single-featured-image img.wp-post-image',
      '.featured-area-inner img[data-main-img="1"]',
      'figure.single-featured-image img',
      '.featured-area img.wp-post-image'
    ],
    country: 'chile'
  },

  // Reporte Minero
  'reporteminero.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?reporteminero\.cl\/noticia\/[\w-]+\/\d{4}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.my-2',
      '.content-header h1'
    ],
    content: [
      '.ck-content > p:not(.hide-print-box *):not(.raw-html-embed *):not(.fb-comments *)',
      '.col-12.col-md-12.ck-content > p:not(.banner-ads-cod *):not(.twitter-tweet *):not([class*="fb_iframe_widget"])',
      '.ck-content > h2:not(.hide-print-box *):not(:contains("COMENTA AQUÍ"))',
      '.ck-content > p:not(:contains("Si te interesa recibir noticias")):not(:contains("Si vas a utilizar contenido"))'
    ],
    date: [
      'small:contains("Por")',
      'small:contains(", ")'
    ],
    image: [
      '.img.my-3.pb-3 img',
      'div.img img[src*="/files/"]',
      'img[src*="/files/"][class*="col-12"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2} de [a-zA-Zé]+ de \d{4})/);
      return match ? match[1] : null;
    },
    country: 'chile'
  },

  // El Tribuno de Jujuy
  'eltribunodejujuy.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?eltribunodejujuy\.com\/[\w-]+\/(?:\d{4})-(?:\d{1,2})-(?:\d{1,2})-(?:\d{1,2})-(?:\d{1,2})-(?:\d{1,2})-[\w-]+\/?$/
    ],
    title: [
      'h1.articulo__titulo',
      '.articulo__titulo'
    ],
    content: [
      'div[amp-access="mostrarNota"] > p:not(:has(script)):not(:empty)',
      '.articulo__cuerpo > p:not(:has(.container-spot))',
      'div[amp-access="mostrarNota"] p:not(:has(iframe)):not(:has(.container-spot))'
    ],
    image: [
      'div.articulo__media amp-img[src*="uscdn.eltribunodejujuy.com"]',
      'div.articulo__media img[src*="uscdn.eltribunodejujuy.com"]',
      'amp-img[src*="uscdn.eltribunodejujuy.com"]'
    ],
    date: [
      'time.articulo__fecha',
      '.articulo__fecha'
    ],
    country: 'argentina'
  },

  // El Libertario
  'ellibertario.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?ellibertario\.com\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'h1.single-post-title .post-title',
      '.single-post-title span[itemprop="headline"]'
    ],
    content: [
      '.entry-content.clearfix.single-post-content > p:not(:has(.google-auto-placed))',
      '.entry-content > p:not(:empty):not(:has(script)):not(:has(ins))',
      '.single-post-content > p:not(:has(.adsbygoogle))'
    ],
    date: [
      '.post-meta.single-post-meta time.post-published',
      '.single-post-meta time[datetime]'
    ],
    image: [
      'div.single-featured img[src]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/Publicado el\s+<b>(\d{1,2} de [a-zA-Zé]+ de \d{4})<\/b>/);
      return match ? match[1] : null;
    },
    country: 'argentina'
  },

  // Ser Industria
  'serindustria.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?serindustria\.com\.ar\/[\w-]+\/?$/
    ],
    title: [
      'h1.entry-title',
      '.entry-title'
    ],
    content: [
      '.entry-content > p:not(:has(img)):not(:has(a)):not(:empty)',
      '.entry-content p:not(:has(.serindustria-banners-noticia-1)):not(:has(script))',
      '.entry-content > p:not(:has([id^="serindustria-"]))'
    ],
    date: [
      'h6.fecha-noticia-single',
      '.fecha-noticia-single'
    ],
    image: [
      'figure.post-thumbnail img.wp-post-image',
      'figure.post-thumbnail img[src*="webmdq-websites.nyc3.digitaloceanspaces.com"]',
      '.wp-block-image img[src*="webmdq-websites.nyc3.digitaloceanspaces.com"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2})\s+([a-zA-Zé]+),\s+(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'argentina'
  },

  // Ministerio de Relaciones Exteriores de Chile
  'minrel.gob.cl': {
    country: 'chile',
    urlPatterns: [
      /^https?:\/\/(?:www\.)?minrel\.gob\.cl\/noticias-anteriores\/[\w-]+\/?$/
    ],
    title: [
      'div.auxi_content h1.tit-art',
      'h1.titular.tit-art'
    ],
    content: [
      'div.CUERPO p:not(.ads-box *)',
      'div.cuerpo p:not(footer p)'
    ],
    date: [
      'div.img-art span.fecha',
      'div.fecha'
    ],
    image: [
      'div.img-art img[src]',
      'meta[property="og:image"]',
      'img.fullwidth[src^="/minrel/site/artic/"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
      return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
    }
  },

  // Salta Mining
  'saltamining.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?saltamining\.com\/contenido\/\d+\/[\w-]+$/
    ],
    title: [
      'h1.fullpost__titulo',
      '.fullpost__titulo'
    ],
    content: [
      '.fullpost__cuerpo > p:not(:has(img)):not(:has(.publi))',
      '.fullpost__cuerpo p:not(:has(.img-responsive)):not(:has(.publi))'
    ],
    date: [
      '.fullpost__fecha .fecha',
      'span.fullpost__fecha span.fecha'
    ],
    image: [
      'div.fullpost__imagen img[data-src]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return new Date(`${año}-${mes}-${dia}T00:00:00.000Z`);
      }
      return null;
    },
    country: 'argentina'
  },

  // Gobierno de Salta
  'salta.gob.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?salta\.gob\.ar\/prensa\/noticias\/[\w-]+-\d+$/
    ],
    title: [
      'h1.h2.mt-0.font-weight-bold',
      'h1.h2.mt-0.font-weight-bold a'
    ],
    content: [
      '.contenido.mb-4.text-justify p[style*="text-align:justify"]',
      '.contenido.mb-4.text-justify > p'
    ],
    date: [
      'span.badge.badge-secondary:not(:has(a))',
      'span.badge-secondary:not(:has(a))'
    ],
    image: [
      '.col-lg-6 img.img-fluid[src*="/public/images/noticias/"]',
      'img.d-block.w-100.img-fluid[src*="/public/images/noticias/"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (match) {
        const [_, dia, mes, año, hora, minutos] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'argentina'
  },


  // CEI Noticias Chile
  'ceinoticias.cl': {
    country: 'chile',
    urlPatterns: [
      /^https?:\/\/ceinoticias\.cl\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h1.brxe-post-title',
      '#brxe-702301'
    ],
    content: [
      'div.brxe-post-content p',
      '#brxe-02c898 p'
    ],
    date: [
      'div.brxe-post-meta span.item:last-child',
      '#brxe-0904a9 span.item:last-child'
    ],
    image: [
      'div.brxe-div img.brxe-image',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const [dia, mes, año] = dateText.split('/');
      return `${dia} de ${mes} de ${año}`;
    },
  },

  // Página 12 Argentina
  'pagina12.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?pagina12\.com\.ar\/[\w-]+$/,
      /^https?:\/\/(?:www\.)?pagina12\.com\.ar\/(?:\d+)-[\w-]+$/
    ],
    title: [
      'div.col.2-col h1',
      'h1.article-titles__main-title',
      'h1.article-titles__title',
      'div.article-titles h1',
      'h1.article-title'
    ],
    content: [
      'div.article-main-content p:not(.ads-box *):not(.banner-inner *)',
      'div.article-text p:not(.ads-box *)',
      'div.article-content p:not(.ads-box *)'
    ],
    date: [
      'div.date.modification-date time',
      'time.article-date',
      'div.date-time',
      'div.article-date',
      'span.article-date'
    ],
    image: [
      'div.article-main-media-image__container img.image',
      'div.image-wrapper img',
      'picture img.image',
      'figure img.image',
      'div.article-main-media img'
    ],
    country: 'argentina'
  },

  // ProSalta Argentina
  'prosalta.org.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?prosalta\.org\.ar\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h1.h2.blanco strong',
      'h1.blanco strong'
    ],
    content: [
      'div[align="justify"] p:not(:has(img))',
      'div[align="justify"] > p:not(:has(.wp-image))'
    ],
    date: [
      // No tiene fecha en el contenido, usará fecha de scraping
      'meta[property="article:published_time"]' // Por si acaso
    ],
    image: [
      'div.featured img[src*="/wp-content/uploads/"]',
      'img[srcset*="prosalta.org.ar/wp-content/uploads/"]'
    ],
    dateParser: () => null, // Forzará usar fecha actual
    priority: () => 2,
    country: 'argentina'
  },

  // Diario Punto Uno Argentina
  'diariopuntouno.ar': {
    country: 'argentina',
    urlPatterns: [
      /^https?:\/\/(?:www\.)?diariopuntouno\.ar\/dp1_21\/index\.php\/[\w-]+\/\d+/
    ],
    title: [
      'div.page-header h2[itemprop="headline"]',
      'h2[itemprop="headline"]'
    ],
    content: [
      'div[itemprop="articleBody"] p:not(:has(img))',
      'div[itemprop="articleBody"] > p:not(:has([src*="/images/ilustraciones/"]))'
    ],
    date: [
      'dd.published time[datetime]',
      'time[itemprop="datePublished"]'
    ],
    image: [
      'div[itemprop="articleBody"] img[src*="/dp1_21/images/ilustraciones/"]',
      'div[itemprop="articleBody"] p > img[src*="/dp1_21/images/"]',
      'div[itemprop="articleBody"] img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2})\s+([a-zA-Zé]+)\s+(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
  },

  // Nuestromar Argentina
  'nuestromar.org': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?nuestromar\.org\/[\w-]+\/[\w-]+/
    ],
    title: [
      'h1.elementor-heading-title',
      'section.elementor-section h1'
    ],
    content: [
      'div.elementor-widget-container p:not(.relpost-block-single *)',
      'div.elementor-widget-container h2.wp-block-heading + p'
    ],
    date: [
      'time[itemprop="datePublished"]',
      'li.elementor-post-info__item--type-date time'
    ],
    image: [
      'img[src*="media.licdn.com"]', // Selector específico para imágenes de LinkedIn
      'div.elementor-widget-image img[src]'
    ],
    country: 'argentina',
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    }
  },

  // Agendamaritima.cl
  'agendamaritima.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?agendamaritima\.cl\/[\w-]+\/[\w-]+\/\d+\//
    ],
    title: [
      'h1.headline.mainTitle',
      'h1.t40.tm19'
    ],
    content: [
      'div.bodytext p:not(.adnuntius-ad *)', // Ignorar publicidad
      'div[data-element-guid] p:not(:has(a))'
    ],
    date: [
      'time[datetime]',
      'span.datePublished time'
    ],
    image: [
      'picture source[type="image/webp"]', // Priorizar webp
      'div.media figure img'
    ],
    country: 'chile',
    dateFormats: ['dd.MM.yyyy - HH:mm'] // Formato específico
  },

  // Configuración para nuevamineria.com
  'nuevamineria.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?nuevamineria\.com\/revista\/[\w-]+\/?$/
    ],
    title: [
      'div.detalle h2',
      'h1.entry-title'
    ],
    content: [
      'div.desarrollo p:not([style*="font-size"])', // Ignorar párrafos con estilos inline
      'div.entry-content p:not(.ads-box)'
    ],
    date: [
      'div.dates',
      'time.entry-date'
    ],
    image: [
      'div.cajaimgint img.img-responsive',
      'meta[property="og:image"]',
      'figure.wp-block-image img'
    ],
    country: 'chile',
    dateParser: (dateText: string) => {
      console.log(`[DEBUG][nuevamineria] Fecha original: ${dateText}`);
      
      // Normalizar el texto
      const normalizedDate = dateText
        .replace(/ de /g, ' ')
        .replace(/,/g, '')
        .trim()
        .toLowerCase();

      console.log(`[DEBUG][nuevamineria] Fecha normalizada: ${normalizedDate}`);
      
      // Intentar ambos formatos
      const formatoDiaMesAno = normalizedDate.match(/^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})$/);
      const formatoMesDiaAno = normalizedDate.match(/^([^\d\s]+)\s+(\d{1,2})\s+(\d{4})$/);
      
      console.log(`[DEBUG][nuevamineria] Match formato día-mes-año: ${JSON.stringify(formatoDiaMesAno)}`);
      console.log(`[DEBUG][nuevamineria] Match formato mes-día-año: ${JSON.stringify(formatoMesDiaAno)}`);

      if (formatoDiaMesAno) {
        const [_, dia, mes, año] = formatoDiaMesAno;
        return `${dia} de ${mes} de ${año}`;
      }
      
      if (formatoMesDiaAno) {
        const [_, mes, dia, año] = formatoMesDiaAno;
        return `${dia} de ${mes} de ${año}`;
      }

      return null;
    },
    priority: (url) => url.includes('/revista/') ? 2 : 1
  },

  // Voz de América
  'vozdeamerica.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?vozdeamerica\.com\/a\/[\w-]+\/\d+\.html$/
    ],
    title: ['h1.title.pg-title'],
    date: [
      'time[datetime]',
      'span.date'
    ],
    content: [
      'div.wsw > p:not(:has(+ div.wsw__embed))',
      'div.wsw > h3.wsw__h3',
      'div.wsw > p:not(:last-child)'
    ],
    image: [
      'div.img-wrap img:not(.wsw__embed img)',
      'meta[property="og:image"]'
    ],
    exclude: [
      '.wsw__embed',
      'div[data-owner-ct="Article"]',
      'p:has(a[href*="facebook.com"]):last-child'
    ],
    country: 'mundo',
    priority: (url: string) => 1
  },
  
  // Defrentesalta Argentina
  'defrentesalta.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?defrentesalta\.com\.ar\/contenido\/\d+\/[\w-]+$/
    ],
    title: [
      'h1.fullpost__titulo',
      '.fullpost__titulo'
    ],
    content: [
      '.fullpost__cuerpo p:not([id^="publi-"]):not(:has(.publi))',
      '.fullpost__cuerpo > p:not(:has(img.publi-imagen))'
    ],
    date: [
      '.fullpost__fecha .fecha',
      'span.fullpost__fecha span.fecha'
    ],
    image: [
      'div.fullpost__imagen img.img-responsive',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        // Convertir directamente a formato ISO
        return new Date(`${año}-${mes}-${dia}T00:00:00.000Z`);
      }
      return null;
    },
    country: 'argentina'
  },

  // El Mostrador Chile
  'elmostrador.cl': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?elmostrador\.cl\/[\w-]+\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?elmostrador\.cl\/aqui-[\w-]+\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.d-the-single__title',
      '.js_the_single_title',
      'article h1.headline'
    ],
    content: [
      // Extraer el contenido principal evitando secciones de publicidad y formularios
      '.d-the-single-wrapper__text > p:not(:has(script)):not(:has(.responsive-container))',
      '.d-the-single-wrapper__text > ul',
      '.d-the-single-wrapper__text h2:not(:contains("Destacados"))',
      // Solo incluye el primer artículo (antes del primer separador u-numbered-separator)
      '.d-the-single-wrapper__text > p:not(:has(.u-numbered-separator ~ p))'
    ],
    date: [
      'time.d-the-single__date',
      '.article-date time',
      'time[datetime]'
    ],
    image: [
      // Imágenes dentro del artículo
      '.d-the-single-wrapper__text img[src*="media-front.elmostrador.cl"]',
      '.wp-caption img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "4 marzo, 2025"
      const match = dateText.match(/(\d{1,2})\s+([a-zé]+),\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'chile',
    priority: (url: string) => url.includes('/aqui-arica/') ? 2 : 1
  },

  // Macrofinanzas Paraguay
  'macrofinanzas.com.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?macrofinanzas\.com\.py\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?macrofinanzas\.com\.py\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/
    ],
    title: [
      'h1.entry-title',
      '.entry-title'
    ],
    content: [
      '.td-post-content h1:not(.entry-title)',
      '.td-post-content > h1',
      '.td-post-content > p'
    ],
    date: [
      'span.td-post-date time',
      'time.entry-date'
    ],
    image: [
      '.td-post-featured-image img.entry-thumb',
      '.td-post-featured-image a img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "4 marzo, 2025"
      const match = dateText.match(/(\d{1,2})\s+([a-zé]+),\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'paraguay',
    priority: (url: string) => url.includes('corredor-bioceanico') ? 2 : 1
  },

  // Jujuy al Momento Argentina
  'jujuyalmomento.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?jujuyalmomento\.com\/[\w-]+\/[\w-]+-n\d+$/
    ],
    title: [
      'h1.title',
      '.article-header h1'
    ],
    content: [
      '.cuerpo p:not(:has(script))',
      'div[data-twitter-link] p',
      '.article-content p'
    ],
    date: [
      '.article-date time',
      'div.article-date span time'
    ],
    image: [
      'div.image.itemGallery img[src*="media.jujuyalmomento.com"]',
      'div.gallery img[src*="/adjuntos/"]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "27 de febrero de 2025 - 11:13"
      const match = dateText.match(/(\d{1,2})\s+de\s+([a-zé]+)\s+de\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'argentina',
    priority: (url: string) => url.includes('corredor-bioceanico') ? 2 : 1
  },

  // Ministerio de Relaciones Exteriores Paraguay
  'mre.gov.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?mre\.gov\.py\/index\.php\/[\w-]+\/[\w-]+$/,
      /^https?:\/\/(?:www\.)?mre\.gov\.py\/index\.php\/noticias-de-embajadas-y-consulados\/[\w-]+$/
    ],
    title: [
      'h5.page-title',
      '.page-title',
      'h1.title'
    ],
    content: [
      '.section.contenido_principal p:not([data-redactor-inserted-image])',
      '.contenido_principal p:not(:has(img))',
      'div[class*="contenido"] p'
    ],
    date: [
      'blockquote.ccm-block-page-attribute-display-wrapper',
      '.ccm-block-page-attribute-display-wrapper'
    ],
    image: [
      'p[data-redactor-inserted-image="true"] img',
      'img[id="image-marker"]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "Publicado:  02/25/25 04:23:p. m."
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (match) {
        const [_, mes, dia, año, hora, minuto] = match;
        // Convertir directamente a formato ISO (notando que el formato es MM/DD/YY americano)
        return new Date(`20${año}-${mes}-${dia}T${hora}:${minuto}:00.000Z`);
      }
      return null;
    },
    country: 'paraguay',
    priority: (url: string) => url.includes('corredor-bioceanico') ? 2 : 1
  },

  // Dirección Nacional de Migraciones Paraguay
  'migraciones.gov.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?migraciones\.gov\.py\/[\w-]+\/?$/
    ],
    title: [
      'div.title h1.h-2',
      '.title h1',
      'h1.h-2'
    ],
    content: [
      'section#content article p[style*="text-align: justify"]',
      'section#content article p',
      '#content p'
    ],
    date: [
      'section#content',
      '#content'
    ],
    image: [
      'section#content article p img.aligncenter',
      'article img[src*="migraciones.gov.py"]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      const match = dateText.match(/(\d{1,2})\s+([a-zé]+),\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        return `${dia} de ${mes} de ${año}`;
      }
      return null;
    },
    country: 'paraguay',
    priority: (url: string) => url.includes('corredor-bioceanico') ? 2 : 1
  },

  // Portal Oficial del Corredor Bioceánico
  'corredorbioceanico.org': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?corredorbioceanico\.org\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?corredorbioceanico\.org\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h2',
      '.container-text-page h2'
    ],
    content: [
      '.container-text-page p:not(.fecha-noticia):not(.fuente)',
      '.col-lg-8 p:not(.fecha-noticia):not(.fuente)',
      'div[class*="container-text"] p:not(.fuente)'
    ],
    date: [
      'p.fecha-noticia',
      '.fecha-noticia'
    ],
    image: [
      '.container-text-page img[src*="wp-content"]',
      '.container-text-page img',
      'meta[property="og:image"]'
    ],
    exclude: [
      'p.fuente',
      '.fuente'
    ],
    dateParser: (dateText: string) => {
      // Formato: "12 de febrero de 2025"
      const meses = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
      };
      
      const match = dateText.match(/(\d{1,2})\s+de\s+([a-zé]+)\s+de\s+(\d{4})/i);
      if (match) {
        const [_, dia, mesTexto, año] = match;
        const mes = meses[mesTexto.toLowerCase()];
        if (mes) {
          // Formato ISO directo
          return new Date(`${año}-${mes}-${dia.padStart(2, '0')}T00:00:00.000Z`);
        }
      }
      return null;
    },
    country: 'brasil',
    priority: (url: string) => 3 // Alta prioridad por ser fuente oficial
  },

  // Ferrere - Firma legal con noticias sobre el Corredor/Gasoducto Bioceánico
  'ferrere.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?ferrere\.com\/(?:en\/)?news\/[\w-]+\/?$/
    ],
    title: [
      'h1.h3',
      '.article-title h1',
      'header h1'
    ],
    content: [
      '.main-content',
      '.main-content p',
      '.main-content ul',
      '.article-content'
    ],
    date: [
      '.module.article-date .date',
      '.article-date-wrap .date',
      '.article-date li.date'
    ],
    image: [
      '.article-image img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "24/02/2025"
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        // Convertir directamente a formato ISO
        return new Date(`${año}-${mes}-${dia}T00:00:00.000Z`);
      }
      return null;
    },
    country: 'paraguay',
    priority: (url: string) => url.includes('bioceanico') ? 2 : 1
  },

  // El Nacional Paraguay
  'elnacional.com.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?elnacional\.com\.py\/[\w-]+\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.mvp-post-title',
      '.entry-title',
      'article h1'
    ],
    content: [
      '#mvp-content-main p:not([style*="display: none"])',
      '#mvp-content-main p',
      '.post-content p'
    ],
    date: [
      '.mvp-author-info-date time.post-date',
      'span.mvp-post-date time',
      'time.post-date'
    ],
    image: [
      '#mvp-post-feat-img img',
      '.wp-post-image',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "22 de febrero de 2025 - 10:24"
      const match = dateText.match(/(\d{1,2})\s+de\s+([a-zé]+)\s+de\s+(\d{4})/i);
      if (match) {
        const [_, dia, mes, año] = match;
        const meses = {
          'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
          'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
          'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        };
        const mesNum = meses[mes.toLowerCase()];
        if (mesNum) {
          return new Date(`${año}-${mesNum}-${dia.padStart(2, '0')}T00:00:00.000Z`);
        }
      }
      return null;
    },
    country: 'paraguay',
    priority: (url: string) => url.includes('bioceanico') ? 2 : 1
  },

  'rotabioceanicanews.com.br': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?rotabioceanicanews\.com\.br\/[\w-]+\/$/
    ],
    title: [
      'header.cm-entry-header h1.cm-entry-title',
      'h1.cm-entry-title'
    ],
    content: [
      'div.cm-entry-summary p:not(:last-child)', // Excluye los últimos 2 párrafos (fuente y traducción)
      '.cm-entry-summary > p:not(:has(strong))'
    ],
    date: [
      'span.cm-post-date time[datetime]',
      'time.entry-date.published'
    ],
    image: [
      'div.cm-featured-image img.attachment-colormag-featured-image',
      'meta[property="og:image"]'
    ],
    country: 'brasil',
    dateFormats: ['dd \'de\' MMMM, yyyy'], // Formato: "18 de Março, 2025"
    dateParser: (dateText: string) => {
      // Formatear fechas en portugués a formato reconocible
      const mesesPT = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
        'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
        'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
      };
      
      const match = dateText.match(/(\d{1,2}) de (\w+), (\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return new Date(`${año}-${mesesPT[mes.toLowerCase()]}-${dia.padStart(2, '0')}`);
      }
      return null;
    },
    exclude: [
      'div.cm-entry-summary p:last-child',
      'div.cm-entry-summary p:nth-last-child(2)'
    ]
  },

  'rotabioceanica.com.br': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?rotabioceanica\.com\.br\/\d{4}\/\d{2}\/[\w-]+\/$/
    ],
    title: [
      'h1.entry-title',
      '.entry-title'
    ],
    content: [
      'div.entry-content p:not(:has(strong))', // Excluye párrafos con negritas (fuente)
      'div.entry-content > p:not(:has(a))'     // Excluye párrafos con enlaces
    ],
    date: [
      'time.entry-date[datetime]',
      'time[datetime].published'
    ],
    image: [
      'figure.wp-caption img:first-child', // Prioriza imágenes con caption
      'div.entry-content img:first-of-type',
      'meta[property="og:image"]'
    ],
    country: 'brasil',
    exclude: [
      'div.heateor_sss_sharing_container', // Compartir en redes
      'div.angwp',                         // Anuncios
      'figure.wp-caption figcaption'       // Texto de imágenes
    ],
    dateParser: (dateText: string) => {
      // Usar el atributo datetime como fuente primaria
      const datetimeMatch = dateText.match(/datetime="([^"]+)"/);
      if (datetimeMatch) {
        return new Date(datetimeMatch[1]); // Parsear ISO 8601 directamente
      }
      
      // Fallback para texto en portugués
      const mesesPT = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
        'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
        'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
      };
      
      const match = dateText.match(/(\d{1,2}) de (\w+) de (\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return new Date(`${año}-${mesesPT[mes.toLowerCase()]}-${dia.padStart(2, '0')}`);
      }
      return null;
    }
  },

  // Tribuna do Pantanal (Brasil)
  'tribunadopantanal.com.br': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?tribunadopantanal\.com\.br\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?tribunadopantanal\.com\.br\/(?:\d{4})\/(?:\d{2})\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?tribunadopantanal\.com\.br\/category\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'h1.cm-entry-title',
      'header.cm-entry-header h1'
    ],
    content: [
      'div.cm-entry-summary p:not(.at-above-post *):not(.at-below-post *)',
      '.cm-post-content p:not(.at-above-post *):not(.at-below-post *)'
    ],
    date: [
      'time.entry-date',
      'span.cm-post-date time'
    ],
    image: [
      'div.cm-entry-summary img',
      '.cm-post-content img'
    ],
    country: 'brasil',
    exclude: [
      '.at-above-post',
      '.at-below-post',
      '.addthis_tool'
    ]
  },

// ABC Paraguay
  'abc.com.py': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?abc\.com\.py\/[\w-]+\/(?:\d{4})\/(?:\d{2})\/(?:\d{2})\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?abc\.com\.py\/[\w-]+\/[\w-]+\/[\w-]+\/?$/
    ],
    title: [
      'div.article-title h1',
      'h1.article-title',
      '.article-title h1 span'
    ],
    content: [
      '#article-content p:not(.whatsapp-button-container):not(.insertitial-link):not(.noreadme-audima)',
      'div.article-content article p:not(.whatsapp-button-container):not(.insertitial-link)'
    ],
    date: [
      'div.article-date',
      '.article-date'
    ],
    image: [
      'div.article-main-media img',
      '.slider-article-main-media img',
      'figure img'
    ],
    country: 'paraguay',
    exclude: [
      '.whatsapp-button-container',
      '.insertitial-link',
      '.noreadme-audima'
    ]
  },

  // Correio do Estado - Brazil
  'correiodoestado.com.br': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?correiodoestado\.com\.br\/[\w-]+\/[\w-]+\/\d+\/?$/,
      /^https?:\/\/(?:www\.)?correiodoestado\.com\.br\/noticia\/detalhe\/[\w-]+\/\d+\/?$/
    ],
    title: [
      'h1.titulo-noticia',
      '.titulo-noticia'
    ],
    content: [
      'article p:not(.descricao-foto):not(.autor-noticia):not(.data-noticia)',
      'article > p:not(.banner-inner *):not(.propaganda-conteudo *)'
    ],
    date: [
      'small.data-noticia',
      '.data-noticia'
    ],
    image: [
      '.foto-conteudo',
      'div.dn_imagemComLegenda img',
      'a.lightbox img'
    ],
    exclude: [
      '.propaganda-conteudo',
      '.banner'
    ],
    dateParser: (dateText: string) => {
      // Handle format like "12/02/2025 - 10h40"
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{1,2})h(\d{2})/);
      if (match) {
        const [_, day, month, year, hour, minute] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
      }
      return null;
    },
    country: 'brasil'
  },

  'agroin.com.br': {
    urlPatterns: [/agroin\.com\.br/],
    title: ['h1.news-title'],
    content: ['div.news-text p'],
    date: ['div.news-date'],
    image: ['div.news-text p img'],
    country: 'br',
    exclude: ['div.row', 'div.mega-banner-container'],
    dateParser: (dateText: string) => {
      // Formato: "Publicado em 12/03/2025 22h37"
      const match = dateText.match(/Publicado em (\d{2})\/(\d{2})\/(\d{4}) (\d{2})h(\d{2})/);
      if (match) {
        const [_, day, month, year, hour, minute] = match;
        return `${day}/${month}/${year} ${hour}:${minute}`;
      }
      return null;
    }
  },

  // Jujuy al Día
  'jujuyaldia.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?jujuyaldia\.com\.ar\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/
    ],
    title: [
      'h1.is-title.post-title',
      'div.post-meta-a h1'
    ],
    content: [
      'div.post-content.cf.entry-content p',
      'div.post-content p:not(:has(.a2a_button))',
      'div.entry-content p:not(:has(.addtoany_share_save_container))'
    ],
    date: [
      'time.post-date',
      'span.has-next-icon.date time'
    ],
    image: [
      'div.single-featured img',
      'div.featured img',
      'meta[property="og:image"]'
    ],
    country: 'argentina'
  },
  
  // Somos Jujuy Argentina
  'somosjujuy.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?somosjujuy\.com\.ar\/[\w-]+\/[\w-]+-n\d+$/
    ],
    title: [
      'h1.tit-ficha',
      '.tit-ficha'
    ],
    content: [
      'div.col > p:not(:has(.rela)):not(:has(.tags-content)):not(:empty)',
      'div.col > p:not(:has(a[href*="/jujuy/"])):not(:has(strong.sat))'
    ],
    date: [
      'meta[property="article:published_time"]', // Usa la fecha del meta si está disponible
      'time.info-time',
      '.fecha-hora'
    ],
    image: [
      'figure.image-detail.wlz img.cst_img',
      'figure.image-detail picture img',
      'figure.image img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Si no hay fecha explícita en la página, usar la de publicación del meta
      return null;
    },
    country: 'argentina'
  },
  
  // Red Uno Bolivia
  'reduno.com.bo': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?reduno\.com\.bo\/noticias\/[\w-]+-\d+$/
    ],
    title: [
      'div.encabezado h1.titulo',
      'h1.titulo[itemprop="headline"]'
    ],
    content: [
      'div.body__cuerpo > p:not(:empty):not(:has(amp-img)):not(:has(.container_publi))',
      'div.body__cuerpo > p:not(:has(.container-spot-back))'
    ],
    date: [
      'p.fecha',
      'div.autor-fecha p.fecha'
    ],
    image: [
      'amp-img[layout="responsive"] img',
      'amp-img img.i-amphtml-fill-content',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "20/03/2025 11:15"
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (match) {
        const [_, dia, mes, año, hora, minutos] = match;
        return new Date(`${año}-${mes}-${dia}T${hora}:${minutos}:00.000Z`);
      }
      return null;
    },
    country: 'bolivia'
  },
  
  // Prensa Jujuy - Argentina (sitio oficial)
  'prensa.jujuy.gob.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?prensa\.jujuy\.gob\.ar\/[\w-]+\/[\w-]+-n\d+$/,
      /^https?:\/\/(?:www\.)?prensa\.jujuy\.gob\.ar\/corredor-bioceanico-capricornio\/[\w-]+-n\d+$/
    ],
    title: [
      'h1.title',
      '.article-title h1.title',
      'div.article-title h1'
    ],
    content: [
      'article.article-body .article-content p',
      'article.article-body .cuerpo p',
      'div.cuerpo[data-twitter-link] p'
    ],
    date: [
      'div.article-date time',
      'div.article-date span time',
      'time[datetime]'
    ],
    image: [
      '#content-gallery img[src*="media.prensa.jujuy.gob.ar"]',
      '.gallery img[src*="/adjuntos/"]',
      '.itemGallery img[width="700"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "22 de diciembre de 2024 - 13:04"
      const match = dateText.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+-\s+(\d{1,2}):(\d{2})/);
      if (match) {
        const [_, dia, mes, año, hora, minuto] = match;
        const meses = {
          'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
          'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
          'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        };
        const mesNum = meses[mes.toLowerCase()];
        if (mesNum) {
          return new Date(`${año}-${mesNum}-${dia.padStart(2, '0')}T${hora.padStart(2, '0')}:${minuto}:00.000Z`);
        }
      }
      return null;
    },
    country: 'argentina'
  },
  
  // H2 Foz - Brasil (noticias fronterizas)
  'h2foz.com.br': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?h2foz\.com\.br\/(?:es\/)?[\w-]+\/[\w-]+\/?$/,
      /^https?:\/\/(?:www\.)?h2foz\.com\.br\/(?:es\/)?fronteira\/[\w-]+\/?$/
    ],
    title: [
      'h1.single-post-title .post-title',
      'h1.single-post-title span[itemprop="headline"]',
      '.post-title[itemprop="headline"]'
    ],
    content: [
      '.entry-content > p:not(.gt-block):not(:has(.h2foz-whatsapp)):not(:has(script)):not(:has(.truvidPos))',
      '.entry-content p:not(:has(.h2foz-desk-antes-do-conteudo)):not(:has(.h2foz-interno-paragrafo-6))',
      '.entry-content > p:not([id^="h2foz-"])'
    ],
    date: [
      'time.post-published.updated[datetime]',
      'span.time time[datetime]',
      '.post-meta time'
    ],
    image: [
      '.single-featured img[src*="h2foz.com.br/wp-content"]',
      'figure.single-featured img',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "Publicado em <b>26 de noviembre de 2024 - 14:46</b>"
      const match = dateText.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+-\s+(\d{1,2}):(\d{2})/);
      if (match) {
        const [_, dia, mes, año, hora, minuto] = match;
        // Meses en español y portugués
        const meses: {[key: string]: string} = {
          // Español
          'enero': '01', 
          'febrero': '02', 
          'marzo': '03', 
          'abril': '04',
          'mayo': '05', 
          'junio': '06', 
          'julio': '07', 
          'agosto': '08',
          'septiembre': '09', 
          'octubre': '10', 
          'noviembre': '11', 
          'diciembre': '12',
          // Portugués
          'janeiro': '01', 
          'fevereiro': '02', 
          'março': '03', 
          // abril es igual en español y portugués
          'maio': '05', 
          'junho': '06', 
          'julho': '07', 
          // agosto es igual en español y portugués
          'setembro': '09', 
          'outubro': '10', 
          'novembro': '11', 
          'dezembro': '12'
        };
        const mesNum = meses[mes.toLowerCase()];
        if (mesNum) {
          return new Date(`${año}-${mesNum}-${dia.padStart(2, '0')}T${hora.padStart(2, '0')}:${minuto}:00.000Z`);
        }
      }
      return null;
    },
    country: 'brasil'
  },
  
  // Revista EyN - América Central y Sudamérica
  'revistaeyn.com': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?revistaeyn\.com\/[\w-]+\/[\w-]+-[A-Z]{2}\d+$/
    ],
    title: [
      'h1.headline span.priority-content',
      'h1[itemprop="headline"] span',
      'h1.headline'
    ],
    content: [
      'div.paragraph > p:not(:has(script)):not(:has(.adnotas)):not(:empty)',
      'div.text div.paragraph > p:not(:has(.ad_block))'
    ],
    date: [
      'div.date',
      'div.date[itemprop="datePublished"]'
    ],
    image: [
      'img[itemprop="image"]',
      'div[style*="position: relative"] img[src*="//www.revistaeyn.com/binrepository/"]',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "2025-02-18"
      const match = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [_, año, mes, dia] = match;
        return new Date(`${año}-${mes}-${dia}T00:00:00.000Z`);
      }
      return null;
    },
    country: 'mundo'
  },
  
  // Cuestión Entrerriana - Argentina
  'cuestionentrerriana.com.ar': {
    urlPatterns: [
      /^https?:\/\/(?:www\.)?cuestionentrerriana\.com\.ar\/[\w-]+\/?$/
    ],
    title: [
      'h1.title.single-title',
      'h1.single-title'
    ],
    content: [
      'div.post-single-content p:not(:has(.tags)):not(:has(iframe))',
      'div.post-single-content > p:not(:has(script))'
    ],
    date: [
      'span.thetime',
      '.post-info span.thetime'
    ],
    image: [
      'img.wp-post-image',
      'img.attachment-full',
      'meta[property="og:image"]'
    ],
    dateParser: (dateText: string) => {
      // Formato: "25/02/2025"
      const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [_, dia, mes, año] = match;
        return new Date(`${año}-${mes}-${dia}T00:00:00.000Z`);
      }
      return null;
    },
    country: 'argentina'
  }
};

export default siteSelectors; 
