export default {
  async sendNotifications(ctx) {
    try {
      const results = await strapi
        .service('api::topic.topic')
        .sendDailyNotifications();

      ctx.send({ message: 'Notificaciones enviadas', data: results });
    } catch (err) {
      ctx.status = 500;
      ctx.send({ error: 'Error al enviar notificaciones', details: err.message });
    }
  },
};
