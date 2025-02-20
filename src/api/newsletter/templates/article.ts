import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Noticia } from '../interfaces/newsletter';

export const renderArticle = (noticia: Noticia, defaultImage: string) => `
  <div class="article">
    <img src="${noticia.image || defaultImage}" 
         alt="${noticia.title}" 
         class="article-image"
         onerror="this.src='${defaultImage}'">
    <div class="article-content">
      <div class="article-header">
        <h3 class="article-title">${noticia.title}</h3>
        <div class="article-date">
          ${format(new Date(noticia.articleDate), "d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>
      </div>
      <p class="article-summary">${noticia.summary}</p>
      <div class="tags">
        ${noticia.tags.map(tag => `#${tag.nombre}`).join(' ')}
      </div>
      <a href="${noticia.sourceUrl}" class="read-more">Leer más</a>
    </div>
  </div>
`; 