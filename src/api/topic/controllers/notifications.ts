export default {
  async sendNewCommentsNotifications(ctx) {
    try {
      const results = await strapi
        .service('api::topic.notifications')
        .sendNewCommentsNotifications();

      ctx.send({ message: 'Notificaciones enviadas', data: results });
    } catch (err) {
      ctx.status = 500;
      ctx.send({ error: 'Error al enviar notificaciones', details: err.message });
    }
  },

  async sendNewTopicNotifications(ctx) {
    try {
      const { userIds, topicId } = ctx.request.body;

      const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { id: { $in: userIds } },
      });

      const topic = await strapi.entityService.findOne('api::topic.topic', topicId, {
        populate: ['users_permissions_user'],
      });

      await strapi.service('api::topic.notifications').sendNewTopicNotifications(users, topic);

      ctx.send({ message: 'Notificaciones enviadas correctamente.' });
    } catch (err) {
      console.error(err);
      ctx.internalServerError('Error al enviar notificaciones.');
    }
  }
};
