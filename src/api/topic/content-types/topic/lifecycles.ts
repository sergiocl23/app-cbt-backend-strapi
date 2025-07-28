export default {
  async afterCreate(event: any) {
    const createdTopic = event.result;

    try {
      // Volver a obtener el topic, pero con el usuario populado
      const topic = await strapi.entityService.findOne('api::topic.topic', createdTopic.id, {
        populate: ['users_permissions_user'], // Aquí el nombre de la relación con el usuario
      });

      // Obtener todos los usuarios confirmados
      const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { confirmed: true },
      });

      // Enviar correos de notificación
      await strapi.service('api::topic.notifications').sendNewTopicNotifications(users, topic);
      console.log('✅ Notificaciones enviadas para nuevo tópico');
    } catch (err) {
      console.error('❌ Error al enviar notificaciones de nuevo tópico:', err);
    }
  },
};

