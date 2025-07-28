import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::topic.topic', ({ strapi }) => ({
  async afterCreate(event) {
    const topic = event.result;

    try {
      // Encuentra los usuarios que deben recibir la notificación
      const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
        // Personaliza esta lógica según tu necesidad: puedes usar roles, tags, etc.
        filters: { 
            confirmed: true 
        },
      });

      // Llama al servicio de notificación
      await strapi.service('api::topic.notifications').sendNewTopicNotifications(users, topic);
    } catch (err) {
      strapi.log.error('Error al enviar notificaciones de nuevo tópico:', err);
    }
  },
}));
