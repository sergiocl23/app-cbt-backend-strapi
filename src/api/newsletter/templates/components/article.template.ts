import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Noticia } from '../../interfaces/newsletter';

/**
 * =============================================================================
 * DOCUMENTACIÓN DEL SISTEMA DE NEWSLETTER
 * =============================================================================
 * 
 * Este componente renderiza artículos individuales para el newsletter por email.
 * Incluye lógica para manejar diferentes tipos de artículos:
 * 
 * 1. NOTICIAS SCRAPEADAS:
 *    - Tienen sourceUrl que dirige a la fuente original externa
 *    - Las imágenes suelen ser URLs absolutas (http://...)
 * 
 * 2. NOTICIAS MANUALES:
 *    - No tienen sourceUrl, se genera un enlace a /api/noticias/ver/:id
 *    - Las imágenes están almacenadas localmente en /uploads/
 * 
 * IMPORTANTE PARA PRODUCCIÓN:
 * ===========================
 * Al deployer en producción se debe configurar:
 * 
 * 1. La variable PUBLIC_URL en .env debe apuntar al dominio público real:
 *    PUBLIC_URL=https://tudominio.com
 * 
 * 2. Verificar que la ruta /api/noticias/ver/:id sea accesible públicamente
 *    (Configurar permisos en Settings → Roles → Public)
 * 
 * MANEJO DE IMÁGENES:
 * ==================
 * - En desarrollo: Se usan placeholders públicos para emails de prueba
 * - En producción: Las imágenes locales se sirven desde PUBLIC_URL/uploads/...
 */

export const renderArticle = (noticia: any) => {
  if (!noticia) {
    console.log('⚠️ Noticia nula o indefinida pasada a renderArticle');
    return '';
  }

  try {
    // Verificar que la noticia tenga los campos mínimos requeridos
    if (!noticia.id || !noticia.title) {
      console.log('⚠️ Noticia sin ID o título:', noticia.id || 'Sin ID');
      
      // Noticia de emergencia para mantener el flujo funcionando
      return `
        <tr>
          <td style="padding: 25px 0; border-bottom: 1px solid #eee;">
            <h3 style="margin: 0; color: #888; font-size: 16px;">
              Error al cargar noticia
            </h3>
          </td>
        </tr>
      `;
    }
    
    // Mostrar todas las propiedades de la noticia para diagnóstico
    console.log(`Propiedades de noticia ID ${noticia.id}:`, Object.keys(noticia).join(', '));

  const {
      id = 0,
    title = '',
    summary = '',
    sourceUrl = '',
    sourceName = '',
    articleDate,
      publishedAt,
      tags = [],
      featuredImage,
      mainImage,
      pais
  } = noticia;

    console.log(`Renderizando artículo ID ${id}: "${title.substring(0, 20)}..."`);
    
    // Diagnóstico expandido
    const debug = {
      hasFeaturedImage: !!featuredImage,
      hasMainImage: !!mainImage,
      // Incluir otras propiedades que podrían contener imágenes
      otherMediaProps: Object.keys(noticia)
        .filter(key => key !== 'featuredImage' && key !== 'mainImage')
        .filter(key => 
          typeof noticia[key] === 'object' && 
          noticia[key] !== null && 
          (key.includes('image') || key.includes('media') || key.includes('file'))
        )
    };
    
    console.log(`Debug noticia ID ${id}:`, JSON.stringify(debug, null, 2));

    // Usar la fecha más reciente entre articleDate y publishedAt
    const dateToUse = articleDate || publishedAt;
    let formattedDate = '';
    
    try {
      if (dateToUse) {
        // Convertir a Date si es string
        const dateObj = typeof dateToUse === 'string' ? new Date(dateToUse) : dateToUse;
        formattedDate = format(dateObj, "d 'de' MMMM, yyyy", { locale: es });
      }
    } catch (e) {
      console.error('Error formateando fecha:', e);
      formattedDate = ''; // En caso de error, no mostrar fecha
    }
    
    // Obtener URL de la imagen usando diferentes estrategias
    let imageUrl = '';
    
    // Validar imagen y obtener URL
    const getImageUrl = (noticia: any) => {
      if (!noticia) return 'cid:logo';
      
      // 1. Si tiene una URL de imagen principal directa (típica de noticias scrapeadas)
      if (noticia.mainImage) {
        // Si es una URL absoluta completa, la usamos directamente
        if (noticia.mainImage.startsWith('http://') || noticia.mainImage.startsWith('https://')) {
          return noticia.mainImage;
        } 
        // Si parece un dominio sin protocolo, añadimos https://
        else if (noticia.mainImage.includes('.') && !noticia.mainImage.startsWith('/')) {
          return `https://${noticia.mainImage}`;
        }
        // Si es una ruta relativa, usamos PUBLIC_URL o localhost
        else if (noticia.mainImage.startsWith('/')) {
          const baseUrl = process.env.PUBLIC_URL || 'http://localhost:1337';
          return `${baseUrl}${noticia.mainImage}`;
        }
      }
      
      // 2. Si tiene imagen destacada (featuredImage) del media library de Strapi
      if (noticia.featuredImage?.url) {
        const url = noticia.featuredImage.url;
        // Si es una URL completa, la usamos directamente
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        // Si es una ruta relativa (/uploads/...)
        else if (url.startsWith('/')) {
          const baseUrl = process.env.PUBLIC_URL || 'http://localhost:1337';
          return `${baseUrl}${url}`;
        }
      }
      
      // Si no encontramos una imagen válida, usamos el logo
      return 'cid:logo';
    };

    imageUrl = getImageUrl(noticia);
    
    console.log(`【IMAGEN FINAL】Noticia ID ${id} "${title.substring(0, 15)}..." → ${imageUrl || 'Sin imagen ❌'}`);

    // Procesar URL de imagen para asegurar que sea accesible externamente
    if (imageUrl) {
      // Verificación final: intentar validar que la URL sea accesible
      try {
        const urlObj = new URL(imageUrl);
        console.log(`URL de imagen validada: ${imageUrl}`);
      } catch (e) {
        console.error(`La URL de imagen no es válida: ${imageUrl}`, e);
        // Usar la imagen del logo como respaldo
        imageUrl = 'cid:logo';
      }
    } else {
      console.log('No se encontró imagen para este artículo, usando logo como respaldo');
      imageUrl = 'cid:logo';
    }

    // Construir URLs completas para enlaces a noticias
    let linkUrl = sourceUrl;
    
    // Para noticias scrapeadas, validamos que la URL sea correcta
    if (linkUrl) {
      try {
        // Verificar si es una URL válida
        new URL(linkUrl);
        console.log(`Noticia scrapeada: Usando URL original ${linkUrl}`);
      } catch (e) {
        // Si la URL no es válida, intentamos arreglarla
        if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
          linkUrl = `https://${linkUrl}`;
          console.log(`Noticia scrapeada: Corrigiendo URL a ${linkUrl}`);
          
          try {
            // Verificamos de nuevo
            new URL(linkUrl);
          } catch (e) {
            // Si sigue fallando, usamos una URL interna
            console.error(`La URL no es válida incluso después de corrección: ${linkUrl}`);
            
            // Usar URL interna como respaldo
            const baseUrl = process.env.PUBLIC_URL || 'http://localhost:1337';
            
            linkUrl = `${baseUrl}/api/noticias/ver/${id}`;
            console.log(`Usando URL interna como respaldo: ${linkUrl}`);
          }
        }
      }
    } 
    // Si no tiene URL externa (noticias manuales), generar enlace a la vista interna
    else {
      // Usar el valor de PUBLIC_URL o localhost por defecto
      const baseUrl = process.env.PUBLIC_URL || 'http://localhost:1337';
      
      linkUrl = `${baseUrl}/api/noticias/ver/${id}`;
      console.log(`Noticia manual: Generando enlace interno a ${linkUrl}`);
    }

    /**
     * Determinar el color del país usando la paleta de colores tarapaqueña
     * - Chile: #BE1622 (Rojo)
     * - Argentina: #36A9E1 (Celeste)
     * - Brasil: #A79964 (Dorado)
     * - Paraguay: #202445 (Azul marino)
     */
    const getColorPais = (paisCode: string) => {
      const coloresPaises = {
        'chile': '#BE1622',
        'argentina': '#36A9E1',
        'brasil': '#A79964',
        'paraguay': '#202445',
        'mundo': '#555555'
      };
      return coloresPaises[paisCode?.toLowerCase()] || '#202445';
    };

    const colorPais = getColorPais(pais);
    
    // Generar etiquetas HTML para las categorías
    let tagsHtml = '';
    if (tags && tags.length > 0) {
      tagsHtml = `
        <div style="margin-top: 8px;">
          ${tags.map(tag => `
            <span style="display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 11px; color: #666; background-color: #f1f1f1; padding: 2px 6px; border-radius: 3px;">
              ${tag.nombre || tag.name || ''}
            </span>
          `).join('')}
        </div>
      `;
    }

  return `
    <tr>
        <td style="padding: 15px 0; border-bottom: 1px solid #e0e0e0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
            <tr>
              ${imageUrl ? `
                <td width="120" valign="top" style="padding-right: 15px;">
                  <img src="${imageUrl}" alt="${title}" style="width: 120px; height: auto; border: 1px solid #e0e0e0;" />
                </td>
              ` : ''}
              <td valign="top">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-family: Arial, sans-serif;">
                  <a href="${linkUrl}" target="_blank" style="color: #202445; text-decoration: none;">
            ${title}
          </a>
        </h3>
                <p style="margin: 0 0 8px 0; color: #555; font-size: 13px; line-height: 1.4; font-family: Arial, sans-serif;">
          ${summary}
        </p>
                <div style="font-size: 12px; color: #888; font-family: Arial, sans-serif;">
                  ${sourceName ? `${sourceName} · ` : ''}${formattedDate}
                  <span style="display: inline-block; margin-left: 10px;">
                    <a href="${linkUrl}" target="_blank" style="color: ${colorPais}; text-decoration: none; font-weight: bold;">
                      Leer más
                    </a>
                  </span>
                </div>
                ${tagsHtml}
              </td>
            </tr>
          </table>
      </td>
    </tr>
  `;
  } catch (error) {
    console.error('❌ Error al renderizar artículo:', error);
    return `
      <tr>
        <td style="padding: 15px 0; border-bottom: 1px solid #eee;">
          <p style="color: #888; font-style: italic;">Error al cargar una noticia</p>
        </td>
      </tr>
    `; // En caso de error, mostrar un mensaje genérico
  }
}; 