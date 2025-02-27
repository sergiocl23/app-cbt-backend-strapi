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
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: 'maxiloxito12@gmail.com',
          pass: 'fcoz kupe lhui qepc',
        },
      },
      settings: {
        defaultFrom: 'maxiloxito12@gmail.com',
        defaultReplyTo: 'maxiloxito12@gmail.com',
      },
    },
  },
});
