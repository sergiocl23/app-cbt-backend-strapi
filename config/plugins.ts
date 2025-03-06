import { env } from '@strapi/utils';

export default () => ({
  'strapi-plugin-populate-deep': {
    config: {
      defaultDepth: 3
    }
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp.gmail.com'),
        port: env.int('SMTP_PORT', 465),
        secure: true,
        auth: {
          user: env('SMTP_USER'),
          pass: env('SMTP_PASSWORD'),
        },
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'newsletter@corredorbioceanico.com'),
        defaultReplyTo: env('SMTP_REPLY_TO', 'soporte@corredorbioceanico.com'),
      },
    },
  },
  upload: {
    config: {
      provider: 'local',
      providerOptions: {},
      sizeLimit: 20 * 1024 * 1024, // 20 MB en bytes
    },
  },
});
