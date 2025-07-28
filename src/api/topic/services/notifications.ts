import { subHours } from 'date-fns';

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
    }) as any[]; // 👈 Solución rápida para evitar error con .forEach
    
    
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
            author: post.users_permissions_user?.name+' '+post.users_permissions_user?.lastName+' '+post.users_permissions_user?.lastName2+' - '+post.users_permissions_user?.institution || 'Desconocido',
            body: post.body,
            date: post.created_at,
          });
        });

        /*
        let html = `<p>Hola ${user.name},</p>`;
        html += `<p>Han habido nuevos comentarios en los tópicos en los que has participado:</p>`;
        for (const [topic, comments] of Object.entries(groupedByTopic)) {
            html += `<h4>${topic}</h4><ul>`;
            // @ts-ignore:
            comments.forEach(comment => {
            html += `<li style = 'margin-bottom: 5px;' ><strong>${comment.author}</strong>: ${comment.body}</li>`;
            });
            html += `</ul>`;
        }

        html += `<p>Gracias por participar en el foro.</p>`;
        */

        let html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Hola ${user.name},</h2>
            <p style="font-size: 16px; color: #555;">
              Aquí tienes un resumen de los nuevos comentarios en los tópicos del foro en los que has participado durante las últimas 24 horas.
            </p>
        `;

        for (const [topic, comments] of Object.entries(groupedByTopic)) {
          const topicSlug = encodeURIComponent(topic.toLowerCase().replace(/\s+/g, '-'));
          html += `
            <div style="margin-top: 30px; padding: 15px; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px;">
              <h3 style="color: #005fa3; margin-bottom: 10px;">${topic}</h3>
              <ul style="padding-left: 20px; color: #444;">
          `;
          // @ts-ignore:
          comments.forEach(comment => {
            html += `
              <li style="margin-bottom: 10px;">
                <p style="margin: 0;">
                  <strong>${comment.author}</strong> comentó:
                </p>
                <p style="margin: 5px 0 0 0; font-style: italic;">"${comment.body}"</p>
              </li>
            `;
          });

          html += `
              </ul>
              <p style="margin-top: 10px;">
                <a href="https://www.corredor-bioceanico-tarapaca.cl/forum/topic/${topicSlug}" 
                  style="color: #005fa3; text-decoration: none;">Ver tópico</a>
              </p>
            </div>
          `;
        }

        html += `
            <p style="margin-top: 40px; font-size: 14px; color: #888;">
              Gracias por ser parte del foro del Corredor Bioceánico Tarapacá.
            </p>
          </div>
        `;

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
