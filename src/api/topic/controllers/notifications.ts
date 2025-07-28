import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::topic.topic', ({ strapi }) => ({
  async sendDailyTopicNotifications(ctx) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      // 1. Obtener todos los usuarios que han participado en algún tópico
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        populate: {
          posts: {
            populate: {
              topics: true,
            }
          }
        }
      });

      for (const user of users) {
        const userId = user.id;

        // Extraer tópicos únicos en los que participó
        const participatedTopics = new Set<number>();
        user.posts.forEach(post => {
          post.topics.forEach(topic => {
            participatedTopics.add(topic.id);
          });
        });

        const notifications: { topicName: string; newComments: any[] }[] = [];

        for (const topicId of participatedTopics) {
          // 2. Buscar posts NUEVOS en ese tópico de OTROS usuarios (últimas 24h)
          const newPosts = await strapi.db.query('api::post.post').findMany({
            where: {
              $and: [
                { createdAt: { $gt: yesterday.toISOString() } },
                { users_permissions_user: { id: { $ne: userId } } },
                { topics: { id: topicId } }
              ]
            },
            populate: ['users_permissions_user', 'topics']
          });

          if (newPosts.length > 0) {
            const topicName = newPosts[0].topics[0]?.name ?? 'Tópico sin nombre';

            notifications.push({
              topicName,
              newComments: newPosts.map(post => ({
                author: post.users_permissions_user?.username ?? 'Anónimo',
                content: post.body,
                date: post.createdAt
              }))
            });
          }
        }

        // 3. Enviar correo si hay notificaciones
        if (notifications.length > 0) {
          const emailBody = notifications.map(n => {
            const comments = n.newComments.map(c => `- ${c.author} dijo: "${c.content}"`).join('\n');
            return `🔹 Tópico: ${n.topicName}\n${comments}`;
          }).join('\n\n');

          await strapi.plugins['email'].services.email.send({
            to: user.email,
            subject: 'Resumen diario de comentarios en tus tópicos',
            text: `Hola ${user.username},\n\nAquí tienes un resumen de nuevos comentarios en los tópicos en los que participas:\n\n${emailBody}`
          });
        }
      }

      ctx.send({ message: 'Notificaciones enviadas con éxito' });
    } catch (error) {
      console.error('Error al enviar notificaciones:', error);
      ctx.throw(500, 'Error al enviar notificaciones');
    }
  }
}));
