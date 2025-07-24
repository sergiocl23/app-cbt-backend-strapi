import { env } from '@strapi/utils';

export default () => ({
  'strapi-plugin-populate-deep': {
    config: {
      defaultDepth: 3
    }
  },
  'users-permissions': {
    config: {
      register: {
        emailConfirmation: true,
      },
      email: {
        confirmation: {
          url: 'https://www.corredor-bioceanico-tarapaca.cl/api/auth/email-confirmation', // ← usa dominio público
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
        path: '/usr/sbin/sendmail',
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
      sizeLimit: 20 * 1024 * 1024,
    },
  },
});
