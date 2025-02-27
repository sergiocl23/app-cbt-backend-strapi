import { renderArticle } from './components/article.template';
import { NoticiasPorPais } from '../interfaces/newsletter';

export const renderNewsletter = (noticiasPorPais: NoticiasPorPais, type: string, periodoTexto: string) => {
  const renderSeccionPais = (noticias: any[], pais: string) => {
    if (!noticias || noticias.length === 0) return '';

    return `
      <tr>
        <td style="padding: 20px 0;">
          <h2 style="margin: 0 0 20px 0; color: #2C3E50; text-transform: uppercase;">
            ${pais.toUpperCase()}
          </h2>
          <table style="width: 100%;">
            ${noticias.map(noticia => renderArticle(noticia)).join('')}
          </table>
        </td>
      </tr>
    `;
  };

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Newsletter Corredor Bioceánico</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; margin-top: 20px;">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background-color: #2C3E50;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">
                Novedades del Corredor Bioceánico
              </h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px;">
                ${periodoTexto}
              </p>
            </td>
          </tr>
          ${Object.entries(noticiasPorPais)
            .filter(([_, noticias]) => noticias.length > 0)
            .map(([pais, noticias]) => renderSeccionPais(noticias, pais))
            .join('')}
        </table>
      </body>
    </html>
  `;
};
 