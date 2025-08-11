import { renderArticle } from './components/article.template';
import { NoticiasPorPais } from '../interfaces/newsletter';

/**
 * Plantilla principal del newsletter que utiliza la paleta de colores de Tarapacá, Chile
 * con un diseño limpio y ordenado
 * 
 * Paleta de colores regional:
 * - Dorado/ocre: #A79964 
 * - Celeste:     #36A9E1
 * - Rojo:        #BE1622
 * - Azul marino: #202445
 */
export const renderNewsletter = (noticiasPorPais: NoticiasPorPais, type: string, periodoTexto: string) => {
  const renderSeccionPais = (noticias: any[], pais: string) => {
    if (!noticias || noticias.length === 0) return '';

    const paisesTraducidos = {
      'argentina': 'Argentina',
      'brasil': 'Brasil',
      'chile': 'Chile',
      'paraguay': 'Paraguay',
      'mundo': 'Internacional'
    };

    // Colores para cada país (usando la paleta tarapaqueña)
    const coloresPaises = {
      'chile': '#BE1622', // Rojo para Chile
      'argentina': '#36A9E1', // Celeste para Argentina
      'brasil': '#A79964', // Dorado para Brasil
      'paraguay': '#202445', // Azul marino para Paraguay
      'mundo': '#555555' // Gris para Internacional
    };

    const nombrePais = paisesTraducidos[pais] || pais.toUpperCase();
    const colorPais = coloresPaises[pais] || '#202445';

    return `
      <tr>
        <td style="padding: 0 20px;">
          <h2 style="color: ${colorPais}; font-size: 22px; font-family: Arial, sans-serif; margin: 25px 0 15px 0; border-bottom: 2px solid ${colorPais}; padding-bottom: 8px;">
            ${nombrePais}
          </h2>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 20px;">
          <table width="100%" style="border-collapse: collapse;">
            ${noticias.map(noticia => {
              // Log simplificado de renderizado
              console.log(`📄 Renderizando: ${noticia.title?.substring(0, 30)}...`);
              return renderArticle(noticia);
            }).join('')}
          </table>
        </td>
      </tr>
    `;
  };

  // Verificar si hay noticias para mostrar
  const hayNoticias = Object.values(noticiasPorPais).some(noticias => noticias && noticias.length > 0);

  // Mensaje si no hay noticias
  const sinNoticiasMessage = !hayNoticias ? `
    <tr>
      <td style="padding: 30px; text-align: center;">
        <p style="color: #555; font-size: 16px; font-family: Arial, sans-serif; margin: 0;">
          No hay noticias nuevas para mostrar en este periodo.
        </p>
      </td>
    </tr>
  ` : '';

  const template = `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Newsletter Corredor Bioceánico Tarapacá</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 650px; border-collapse: collapse; margin: 0 auto; background-color: #ffffff;">
          <!-- ENCABEZADO CON FRANJA DE COLORES -->
          <tr>
            <td style="height: 5px; font-size: 0; line-height: 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                <tr>
                  <td width="25%" bgcolor="#A79964" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#36A9E1" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#BE1622" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#202445" style="font-size: 0; line-height: 0; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CABECERA CON LOGO -->
          <tr>
            <td style="text-align: center; padding: 25px 20px; background-color: #202445;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                <tr>
                  <td width="170" style="text-align: left; vertical-align: middle;">
                    <img src="https://www.corredor-bioceanico-tarapaca.cl/assets/images/newsletter/LOGO-GORE-TARAPACA-BLANCO.png" alt="Gobierno Regional de Tarapacá" style="width: 150px; height: auto;" />
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <h1 style="margin: 0 0 5px 0; color: #ffffff; font-size: 22px; font-family: Arial, sans-serif; text-align: right;">
                      Corredor Bioceánico Tarapacá
                    </h1>
                    <p style="margin: 0; color: #ffffff; font-size: 14px; font-family: Arial, sans-serif; text-align: right;">
                      ${periodoTexto}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- INTRO -->
          <tr>
            <td style="padding: 30px 20px 20px 20px; text-align: center; background-color: #ffffff;">
              <p style="margin: 0; color: #444; font-size: 16px; line-height: 1.5; font-family: Arial, sans-serif;">
                A continuación, te presentamos las noticias más relevantes del Corredor Bioceánico.
              </p>
            </td>
          </tr>
          
          <!-- LÍNEA SEPARADORA -->
          <tr>
            <td style="height: 1px; background-color: #e0e0e0; font-size: 0; line-height: 0;"></td>
          </tr>
          
          <!-- SECCIONES POR PAÍS -->
          <tr>
            <td>
              <table width="100%" style="border-collapse: collapse;">
                ${sinNoticiasMessage}
                ${Object.entries(noticiasPorPais)
                  .filter(([_, noticias]) => noticias && noticias.length > 0)
                  .map(([pais, noticias]) => renderSeccionPais(noticias, pais))
                  .join('')}
              </table>
            </td>
          </tr>
          
          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f1f1f1; padding: 25px 20px; text-align: center; border-top: 1px solid #dddddd;">
              <p style="margin: 0 0 15px 0; color: #444; font-size: 14px; font-family: Arial, sans-serif;">
                © ${new Date().getFullYear()} Corredor Bioceánico Tarapacá. Todos los derechos reservados.
              </p>
              <p style="margin: 0; color: #666; font-size: 12px; font-family: Arial, sans-serif;">
                Si prefieres no recibir más emails, puedes <a href="[UNSUBSCRIBE_LINK]" style="color: #36A9E1; text-decoration: none;">darte de baja aquí</a>.
              </p>
              <div style="margin-top: 12px; text-align: center;">
                <p style="font-size: 12px; color: #888;">En caso de detectar errores o requerir asistencia, puede comunicarse al correo <a href="mailto:scerdal@unap.cl">scerdal@unap.cl</a>.</p>
              </div>
            </td>
          </tr>
          
          <!-- FRANJA DE COLORES FINAL -->
          <tr>
            <td style="height: 5px; font-size: 0; line-height: 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                <tr>
                  <td width="25%" bgcolor="#A79964" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#36A9E1" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#BE1622" style="font-size: 0; line-height: 0; height: 5px;"></td>
                  <td width="25%" bgcolor="#202445" style="font-size: 0; line-height: 0; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  console.log('📧 Plantilla HTML generada correctamente');
  return template;
};
 