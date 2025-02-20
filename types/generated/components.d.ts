import type { Struct, Schema } from '@strapi/strapi';

export interface NewsletterQueueJob extends Struct.ComponentSchema {
  collectionName: 'components_newsletter_queue_jobs';
  info: {
    displayName: 'Queue Job';
    description: 'Trabajos individuales de la cola de env\u00EDo';
    example: {
      description: 'Este componente representa un lote de env\u00EDos en la cola';
      usage: {
        batchNumber: 1;
        status: 'processing';
        retries: 1;
        nextRetry: '2024-02-19T10:05:00Z';
        error: 'SMTP connection timeout';
        subscribers: [
          {
            id: 1;
            email: 'user1@email.com';
            status: 'sent';
          },
          {
            id: 2;
            email: 'user2@email.com';
            status: 'pending';
          },
        ];
      };
      explanation: {
        batchNumber: 'N\u00FAmero de lote';
        status: 'Estado del trabajo';
        retries: 'Intentos realizados';
        nextRetry: 'Pr\u00F3ximo intento programado';
        error: '\u00DAltimo error encontrado';
        subscribers: 'Lista de suscriptores en este lote';
      };
    };
  };
  attributes: {
    batchNumber: Schema.Attribute.Integer & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['pending', 'processing', 'completed', 'failed']
    > &
      Schema.Attribute.DefaultTo<'pending'>;
    retries: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    nextRetry: Schema.Attribute.DateTime;
    error: Schema.Attribute.Text;
    subscribers: Schema.Attribute.JSON;
  };
}

export interface NewsletterProgress extends Struct.ComponentSchema {
  collectionName: 'components_newsletter_progress';
  info: {
    displayName: 'Progress';
    description: 'Progreso del env\u00EDo de newsletter';
    example: {
      description: 'Este componente rastrea el progreso de env\u00EDo de un newsletter';
      usage: {
        totalSubscribers: 1000;
        sentCount: 450;
        failedCount: 5;
        retryCount: 2;
      };
      explanation: {
        totalSubscribers: 'Total de destinatarios del newsletter';
        sentCount: 'Correos enviados exitosamente';
        failedCount: 'Env\u00EDos fallidos';
        retryCount: 'N\u00FAmero de reintentos realizados';
      };
    };
  };
  attributes: {
    totalSubscribers: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    sentCount: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    failedCount: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    retryCount: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
  };
}

export interface NewsletterMetrics extends Struct.ComponentSchema {
  collectionName: 'components_newsletter_metrics';
  info: {
    displayName: 'Metrics';
    description: 'M\u00E9tricas del env\u00EDo';
    example: {
      description: 'Este componente almacena m\u00E9tricas de rendimiento del env\u00EDo';
      usage: {
        startTime: '2024-02-19T10:00:00Z';
        endTime: '2024-02-19T10:15:30Z';
        averageDeliveryTime: 1.2;
        bounceRate: 0.02;
        successRate: 0.98;
      };
      explanation: {
        startTime: 'Cuando inici\u00F3 el env\u00EDo';
        endTime: 'Cuando termin\u00F3 el env\u00EDo';
        averageDeliveryTime: 'Tiempo promedio de env\u00EDo en segundos';
        bounceRate: 'Tasa de rebote (2%)';
        successRate: 'Tasa de \u00E9xito (98%)';
      };
    };
  };
  attributes: {
    startTime: Schema.Attribute.DateTime & Schema.Attribute.Required;
    endTime: Schema.Attribute.DateTime;
    averageDeliveryTime: Schema.Attribute.Float;
    bounceRate: Schema.Attribute.Float;
    successRate: Schema.Attribute.Float;
  };
}

export interface NewsletterEmailQueue extends Struct.ComponentSchema {
  collectionName: 'components_newsletter_email_queue';
  info: {
    displayName: 'Email Queue';
    description: 'Cola principal de env\u00EDo de emails';
    example: {
      description: 'Este componente gestiona la cola de env\u00EDo de correos';
      usage: {
        status: 'processing';
        startTime: '2024-02-19T10:00:00Z';
        completedJobs: 45;
        failedJobs: 2;
        jobs: [
          {
            batchNumber: 1;
            status: 'completed';
            subscribers: ['user1@email.com', 'user2@email.com'];
          },
          {
            batchNumber: 2;
            status: 'pending';
            subscribers: ['user3@email.com', 'user4@email.com'];
          },
        ];
      };
      explanation: {
        status: 'Estado actual de la cola';
        startTime: 'Inicio del procesamiento';
        completedJobs: 'Trabajos completados';
        failedJobs: 'Trabajos fallidos';
        jobs: 'Lista de lotes de env\u00EDo';
      };
    };
  };
  attributes: {
    status: Schema.Attribute.Enumeration<
      ['pending', 'processing', 'completed', 'failed']
    > &
      Schema.Attribute.DefaultTo<'pending'>;
    startTime: Schema.Attribute.DateTime & Schema.Attribute.Required;
    completedAt: Schema.Attribute.DateTime;
    completedJobs: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    failedJobs: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    jobs: Schema.Attribute.Component<'newsletter.queue-job', true>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'newsletter.queue-job': NewsletterQueueJob;
      'newsletter.progress': NewsletterProgress;
      'newsletter.metrics': NewsletterMetrics;
      'newsletter.email-queue': NewsletterEmailQueue;
    }
  }
}
