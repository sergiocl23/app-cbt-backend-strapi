export interface Noticia {
  id: number;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName?: string;
  tags: Array<{ nombre?: string; name?: string; }>;
  articleDate?: Date;
  image?: string | null;
  pais: string;
  publishedAt: Date;
  
  /* Campo media - No existe en el modelo actual
  media?: {
    data?: any | any[]; // Puede ser un objeto o un array de objetos
  };
  */
  
  // Diferentes formatos posibles para la imagen destacada
  featuredImage?: {
    id?: number;
    name?: string;
    alternativeText?: string;
    url?: string;
    formats?: {
      thumbnail?: { url: string; width?: number; height?: number; };
      small?: { url: string; width?: number; height?: number; };
      medium?: { url: string; width?: number; height?: number; };
      large?: { url: string; width?: number; height?: number; };
    };
    // Formato alternativo que puede venir de la API
    data?: {
      id?: number;
      attributes?: {
        url?: string;
        formats?: {
          thumbnail?: { url: string; };
          small?: { url: string; };
          medium?: { url: string; };
          large?: { url: string; };
        }
      }
    } | Array<any>; // Puede ser un array en Strapi v5
  } | string;  // Puede ser un string en algunos casos
  
  mainImage?: string;
}

export interface NoticiasPorPais {
  argentina: Noticia[];
  brasil: Noticia[];
  chile: Noticia[];
  paraguay: Noticia[];
  mundo: Noticia[];
}

export interface EmailContent {
  subject: string;
  html: string;
  text?: string;
  content?: string;
  noticias?: number[];
}

export interface Subscriber {
  id: number;
  email: string;
  isActive: boolean;
  frequency: string;
} 