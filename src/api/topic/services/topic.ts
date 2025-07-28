/**
 * topic service
 */
/*
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::topic.topic');
*/


import { subHours } from 'date-fns';

interface ForumPost {
  body: string;
  created_at: string;
  topic?: { id: number; name: string };
  users_permissions_user?: { id: number; username: string };
}

export default ({ strapi }) => ({
  async sendDailyNotifications() {
    //console.log(`\nprobando`);
    const yesterday = subHours(new Date(), 24);

    // 1. Obtener todos los posts con info del topic y del autor
    const posts = await strapi.db.query('api::post.post').findMany({
      populate: {
        topic: true,
        users_permissions_user: true,
      },
    }) as ForumPost[]; // 👈 Solución rápida para evitar error con .forEach
    
    
    // 2. Mapear usuario -> [topics]
    const userTopicsMap = {};
    
    posts.forEach(post => {
    ////   console.log(`\n${Object.entries(post)}`);
      const userId = post.users_permissions_user?.id;
      const topicId = post.topic?.id;
    ////   console.log(`\nuserId: ${userId}, topicId: ${topicId}`);
      if (userId && topicId) {
        //console.log(`\nprobando 2.5`);
        if (!userTopicsMap[userId]) userTopicsMap[userId] = new Set();
        userTopicsMap[userId].add(topicId);
      }
    });
    //// console.log(`\n${Object.entries(userTopicsMap)}`);
    //console.log(`\n${Object.keys(userTopicsMap)}`);

    const notifications = [];

    //console.log(`\nprobando 3`);
    // 3. Para cada usuario, revisar si hay nuevos comentarios en los tópicos
    for (const userId of Object.keys(userTopicsMap)) {
      //console.log(`\nuserId ${userId}`);
      //console.log(`\nprobando 4`);
      const topicIds = Array.from(userTopicsMap[userId]);

      const user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: +userId },
        select: ['email', 'username', 'name'],
      });

      const userPosts = await strapi.db.query('api::post.post').findMany({
        where: {
          topic: { id: topicIds },
          users_permissions_user: { id: { $ne: +userId } },
          created_at: { $gt: yesterday },
        },
        populate: {
          topic: true,
          users_permissions_user: true,
        },
      }) as any[]; // 👈 Solución rápida
      //console.log(`\nprobando 5`);
      
      if (userPosts.length > 0) {
        const groupedByTopic = {};
        //console.log(`\nprobando 5.5`);
        userPosts.forEach(post => {
          const topicName = post.topic?.name || 'Tópico sin nombre';
          if (!groupedByTopic[topicName]) groupedByTopic[topicName] = [];
          groupedByTopic[topicName].push({
            author: post.users_permissions_user?.username || 'Desconocido',
            body: post.body,
            date: post.created_at,
          });
        });

        let html = `<p>Hola ${user.name},</p>`;
        html += `<p>Estos son los nuevos comentarios en los tópicos en los que has participado en las últimas 24 horas:</p>`;
        //console.log(`\nprobando 6`);
        for (const [topic, comments] of Object.entries(groupedByTopic)) {
            //console.log(`\n${comments}`);
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
});
