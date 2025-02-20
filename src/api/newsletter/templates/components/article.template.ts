import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Noticia } from '../../interfaces/newsletter';

export const renderArticle = (noticia: any) => {
  if (!noticia) return '';

  const {
    title = '',
    summary = '',
    sourceUrl = '',
    sourceName = '',
    articleDate,
    tags = []
  } = noticia;

  const formattedDate = articleDate ? new Date(articleDate).toLocaleDateString('es-CL') : '';

  return `
    <tr>
      <td style="padding: 20px 0; border-bottom: 1px solid #eee;">
        <h3 style="margin: 0 0 10px 0; color: #2C3E50; font-size: 18px;">
          <a href="${sourceUrl}" style="color: #2C3E50; text-decoration: none;">
            ${title}
          </a>
        </h3>
        <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
          ${summary}
        </p>
        <p style="margin: 0; color: #999; font-size: 12px;">
          ${sourceName} - ${formattedDate}
        </p>
      </td>
    </tr>
  `;
}; 