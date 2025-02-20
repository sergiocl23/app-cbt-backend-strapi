export interface Noticia {
  id: number;
  title: string;
  summary: string;
  sourceUrl: string;
  tags: { nombre: string }[];
  articleDate: Date;
  image?: string | null;
  pais: string;
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
}

export interface Subscriber {
  id: number;
  email: string;
  isActive: boolean;
  frequency: string;
} 