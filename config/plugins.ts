import { env } from '@strapi/utils';

export default () => ({
  'strapi-plugin-populate-deep': {
    config: {
      defaultDepth: 3
    }
  },
  /*
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
  */
//  email: {
//     config: {
//       provider: 'nodemailer',
//       providerOptions: {
//         host: 'localhost',
//         port: 25,
//         secure: false, // No usar SSL si usas postfix local
//         tls: {
//           rejectUnauthorized: false,
//         },
//       },
//       settings: {
//         defaultFrom: '"Proyecto Corredor Bioceánico" <proyectocb@corredor-bioceanico-tarapaca.cl>',
//         defaultReplyTo: 'proyectocb@corredor-bioceanico-tarapaca.cl',
//       },
//     },
//   },
  'users-permissions': {
    config: {
      register: {
        emailConfirmation: true, // activa confirmación por email
      },
      email: {
        confirmation: {
          url: `${env('SERVER_URL')}/api/auth/email-confirmation`,
        },
      },
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail', // o '/usr/sbin/sendmail' según tu sistema
      },
      settings: {
        defaultFrom: '"Proyecto Corredor Bioceánico" <proyectocb@corredor-bioceanico-tarapaca.cl>',
        defaultReplyTo: 'proyectocb@corredor-bioceanico-tarapaca.cl',
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
