import { formatDistanceToNow, subHours } from 'date-fns';

export default ({ strapi }) => ({
  /*
  async sendNewCommentsNotifications() {
    const yesterday = subHours(new Date(), 24);

    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: {
        blocked: false,
        confirmed: true,
      },
      populate: {
        posts: {
          populate: {
            topic: true,
          },
        },
      },
    });

    // Mapa de tópicos por usuario con su último comentario
    const userTopicsMap = new Map<number, { [topicId: number]: any }>();

    for (const user of users) {
      const topicMap: { [topicId: number]: any } = {};
      for (const post of user.posts || []) {
        const topicId = post.topic?.id;
        if (topicId) {
          const existing = topicMap[topicId];
          if (!existing || new Date(post.createdAt) > new Date(existing.createdAt)) {
            topicMap[topicId] = post;
          }
        }
      }
      userTopicsMap.set(user.id, topicMap);
    }

    for (const user of users) {
      const userId = user.id;
      const topicMap = userTopicsMap.get(userId) || {};

      for (const topicId of Object.keys(topicMap)) {
        const lastUserPost = topicMap[+topicId];
        const after = lastUserPost?.createdAt ?? yesterday;

        const newPosts = await strapi.db.query('api::post.post').findMany({
          where: {
            topic: { id: +topicId },
            users_permissions_user: { id: { $ne: +userId } },
            created_at: { $gt: after },
          },
          populate: {
            topic: true,
            users_permissions_user: true,
          },
        }) as any[];

        if (newPosts.length === 0) continue;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Nuevo comentario en un tema que sigues</h2>
            <p>Han respondido en el tema: <strong>${newPosts[0].topic.title}</strong></p>
            <ul>
              ${newPosts
                .map(post => `<li><strong>${post.users_permissions_user.username}</strong>: ${post.content}</li>`)
                .join('')}
            </ul>
            <p><a href="https://www.corredor-bioceanico-tarapaca.cl/topics/${topicId}">Ver tema</a></p>
          </div>
        `;

        try {
          await strapi.plugins['email'].services.email.send({
            to: user.email,
            subject: 'Nuevo comentario en un tema que sigues',
            html,
          });

          console.log(
            `✅ Notificación enviada a ${user.email} por ${newPosts.length} nuevo(s) comentario(s) en el tópico ${topicId}`
          );
        } catch (err) {
          console.error(`❌ Error al enviar correo a ${user.email}:`, err);
        }
      }
    }
  }
  */
  async sendNewCommentsNotifications() {
    const yesterday = subHours(new Date(), 24);

    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: {
        blocked: false,
        confirmed: true,
      },
      populate: {
        posts: {
          populate: {
            topic: true,
          },
        },
      },
    });

    const userTopicsMap = new Map<number, { [topicId: number]: any }>();

    for (const user of users) {
      const topicMap: { [topicId: number]: any } = {};
      for (const post of user.posts || []) {
        const topicId = post.topic?.id;
        if (topicId) {
          const existing = topicMap[topicId];
          if (!existing || new Date(post.createdAt) > new Date(existing.createdAt)) {
            topicMap[topicId] = post;
          }
        }
      }
      userTopicsMap.set(user.id, topicMap);
    }

    const notifications: { user: string; topics: string[] }[] = [];

    for (const user of users) {
      const userId = user.id;
      const topicMap = userTopicsMap.get(userId) || {};
      const groupedByTopic: Record<string, any[]> = {};

      for (const topicId of Object.keys(topicMap)) {
        const lastUserPost = topicMap[+topicId];
        const after = lastUserPost?.createdAt ?? yesterday;

        const newPosts = await strapi.db.query('api::post.post').findMany({
          where: {
            topic: { id: +topicId },
            users_permissions_user: { id: { $ne: +userId } },
            created_at: { $gt: after },
          },
          populate: {
            topic: true,
            users_permissions_user: true,
          },
        }) as any[];

        if (newPosts.length === 0) continue;

        const topicName = newPosts[0].topic?.name || 'Tópico sin nombre';

        if (!groupedByTopic[topicName]) groupedByTopic[topicName] = [];

        for (const post of newPosts) {
          groupedByTopic[topicName].push({
            author: `${post.users_permissions_user?.name || ''} ${post.users_permissions_user?.lastName || ''} ${post.users_permissions_user?.lastName2 || ''} - ${post.users_permissions_user?.institution || 'Desconocido'}`,
            body: post.body,
            date: post.createdAt,
          });
        }
      }

      if (Object.keys(groupedByTopic).length > 0) {
        let html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Hola ${user.name},</h2>
            <p style="font-size: 16px; color: #555;">
              Han habido nuevos comentarios en los tópicos en los que has participado:
            </p>
        `;

        for (const [topic, comments] of Object.entries(groupedByTopic)) {
          html += `
            <div style="margin-top: 30px; padding: 15px; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px;">
              <h3 style="color: #005fa3; margin-bottom: 10px;">${topic}</h3>
              <ul style="padding-left: 20px; color: #444;">
          `;
          comments.forEach(comment => {
            html += `
              <li style="margin-bottom: 10px;">
                <p style="margin: 0;"><strong>${comment.author}</strong> comentó:</p>
                <p style="margin: 5px 0 0 0; font-style: italic;">"${comment.body}"</p>
              </li>
            `;
          });

          html += `
              </ul>
            </div>
          `;
        }

        html += `
            <div style="margin-top: 40px; text-align: center;">
              <p style="font-size: 16px; color: #333;">Puedes ver más detalles iniciando sesión en la plataforma:</p>
              <a href="https://www.corredor-bioceanico-tarapaca.cl" 
                style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #005fa3; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Ingresar a la Plataforma
              </a>
            </div>

            <p style="margin-top: 40px; font-size: 14px; color: #888;">
              Gracias por ser parte del foro del Corredor Bioceánico Tarapacá.
            </p>
          </div>
        `;

        try {
          await strapi.plugins['email'].services.email.send({
            to: user.email,
            subject: 'Nuevos comentarios en el foro',
            html,
          });

          notifications.push({
            user: user.email,
            topics: Object.keys(groupedByTopic),
          });

          strapi.log.info(`✅ Notificación enviada a ${user.email}`);
        } catch (err) {
          strapi.log.error(`❌ Error al enviar correo a ${user.email}`, err);
        }
      }
    }

    return notifications;
  },

  
  async sendNewTopicNotifications(users, topic) {
  for (const user of users) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <h2 style="color: #333;">Hola ${user.name},</h2>
        <p style="font-size: 16px; color: #555;">
          Se ha creado un nuevo tópico en el foro que podría ser de tu interés:
        </p>

        <div style="margin-top: 30px; padding: 15px; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px;">
          <h3 style="color: #005fa3; margin-bottom: 10px;">${topic.name}</h3>
          <p style="font-size: 15px; color: #444;">${topic.body}</p>
          <p style="font-size: 14px; color: #777; margin-top: 8px;">Publicado por <strong>${topic.users_permissions_user.name} ${topic.users_permissions_user.lastName} ${topic.users_permissions_user.lastName2} - ${topic.users_permissions_user.institution}</strong> en ${new Date(topic.createdAt).toLocaleString()}</p>
        </div>

        <div style="margin-top: 40px; text-align: center;">
          <p style="font-size: 16px; color: #333;">Puedes ver más detalles iniciando sesión en la plataforma:</p>
          <a href="https://www.corredor-bioceanico-tarapaca.cl" 
            style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #005fa3; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Ingresar a la Plataforma
          </a>
        </div>

        <p style="margin-top: 40px; font-size: 14px; color: #888;">
          Gracias por ser parte del foro del Corredor Bioceánico Tarapacá.
        </p>
      </div>
    `;

    await strapi.plugin('email').service('email').send({
      to: user.email,
      subject: 'Nuevo tópico publicado en el foro',
      html: html,
    });
  }
  }
});
