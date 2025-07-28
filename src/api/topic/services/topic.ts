import { subHours } from 'date-fns';

export default {
  async sendDailyNotifications() {
    const yesterday = subHours(new Date(), 24);

    // 1. Obtener todos los posts con info del topic y del autor
    const posts = await strapi.db.query('api::post.post').findMany({
      populate: {
        topic: true,
        created_by: true,
      },
    }) as any[]; // 👈 Solución rápida para evitar error con .forEach

    // 2. Mapear usuario -> [topics]
    const userTopicsMap = {};

    posts.forEach(post => {
      const userId = post.created_by?.id;
      const topicId = post.topic?.id;

      if (userId && topicId) {
        if (!userTopicsMap[userId]) userTopicsMap[userId] = new Set();
        userTopicsMap[userId].add(topicId);
      }
    });

    const notifications = [];

    // 3. Para cada usuario, revisar si hay nuevos comentarios en los tópicos
    for (const userId of Object.keys(userTopicsMap)) {
      const topicIds = Array.from(userTopicsMap[userId]);

      const user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: +userId },
        select: ['email', 'username', 'name'],
      });

      const userPosts = await strapi.db.query('api::post.post').findMany({
        where: {
          topic: { id: topicIds },
          created_by: { id: { $ne: +userId } },
          created_at: { $gt: yesterday },
        },
        populate: {
          topic: true,
          created_by: true,
        },
      }) as any[]; // 👈 Solución rápida

      if (userPosts.length > 0) {
        const groupedByTopic = {};

        userPosts.forEach(post => {
          const topicName = post.topic?.name || 'Tópico sin nombre';
          if (!groupedByTopic[topicName]) groupedByTopic[topicName] = [];
          groupedByTopic[topicName].push({
            author: post.created_by?.username || 'Desconocido',
            body: post.body,
            date: post.created_at,
          });
        });

        let html = `<p>Hola ${user.name},</p>`;
        html += `<p>Estos son los nuevos comentarios en los tópicos en los que has participado en las últimas 24 horas:</p>`;

        for (const [topic, comments] of Object.entries(groupedByTopic)) {
            html += `<h4>${topic}</h4><ul>`;
            // @ts-ignore:
            comments.forEach(comment => {
            html += `<li><strong>${comment.author}</strong>: ${comment.body}</li>`;
            });
            html += `</ul>`;
        }

        html += `<p>Gracias por participar en el foro.</p>`;

        await strapi.plugin('email').service('email').send({
          to: user.email,
          subject: 'Nuevos comentarios en tus tópicos del foro',
          html: html,
        });

        notifications.push({ user: user.email, topics: Object.keys(groupedByTopic) });
      }
    }

    return notifications;
  },
};