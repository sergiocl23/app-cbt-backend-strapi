import { subHours } from 'date-fns';

interface Notification {
  user: string;
  topics: Topic[];
}

interface Topic {
  name: string;
  comments: Comment[];
}

interface Comment {
  author: string;
  body: string;
  date: Date;
}

export default ({ strapi }) => ({

  async sendNewCommentsNotifications() {
    // Calcula la fecha y hora exacta de hace 24 horas
    const yesterday = subHours(new Date(), 24);

    // 1. Obtiene todos los usuarios confirmados y no bloqueados, junto con los posts que hayan hecho y los tópicos correspondientes
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

    // 2. Construye un mapa de usuarios -> último post por cada tópico en el que participaron
    const userTopicsMap = new Map<number, { [topicId: number]: any }>();

    for (const user of users) {
      const topicMap: { [topicId: number]: any } = {};

      for (const post of user.posts || []) {
        const topicId = post.topic?.id;

        if (topicId) {
          const existing = topicMap[topicId];

          // Solo guarda el post más reciente por tópico
          if (!existing || new Date(post.createdAt) > new Date(existing.createdAt)) {
            topicMap[topicId] = post;
          }
        }
      }

      userTopicsMap.set(user.id, topicMap);
    }

    // Acumula notificaciones enviadas para devolver al final
    const notifications: Notification[] = [];

    // 3. Para cada usuario, revisa si hay nuevos comentarios en los tópicos donde participó
    for (const user of users) {
      const userId = user.id;
      const topicMap = userTopicsMap.get(userId) || {};
      const groupedByTopic: Record<string, any[]> = {};

      for (const topicId of Object.keys(topicMap)) {
        const lastUserPost = topicMap[+topicId];
        const after = lastUserPost?.created_at ?? yesterday;

        // 4. Obtiene los nuevos posts hechos por otros usuarios después del último post del usuario actual
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

      // 5. Si hay comentarios nuevos, genera y envía el correo con los comentarios agrupados por tópico
      if (Object.keys(groupedByTopic).length > 0) {
        let html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Hola ${user.name},</h2>
            <p style="font-size: 16px; color: #555;">
              Han habido nuevos comentarios en los tópicos en los que has participado:
            </p>
        `;

        // 6. Construye la estructura del HTML con los comentarios agrupados
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

        // 7. Cierra el HTML con un llamado a la plataforma
        html += `
            <div style="margin-top: 40px; text-align: center;">
              <p style="font-size: 16px; color: #333;">Puedes ver más detalles iniciando sesión en la plataforma:</p>
              <a href="https://www.corredor-bioceanico-tarapaca.cl" 
                style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #005fa3; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Ingresar a la Plataforma
              </a>
            </div>

            <p style="margin-top: 40px; font-size: 14px; color: #888; text-align: center;"">
              Gracias por ser parte del foro del Corredor Bioceánico Tarapacá.
            </p>
            <div style="margin-top: 15px; text-align: center;">
              <p style="font-size: 12px; color: #888;">En caso de detectar errores en esta notificación o requerir asistencia, puede comunicarse al correo <a href="mailto:scerdal@unap.cl">scerdal@unap.cl</a>.</p>
            </div>
          </div>
        `;

        // 8. Envía el correo
        try {
          await strapi.plugins['email'].services.email.send({
            to: user.email,
            subject: 'Nuevos comentarios en el foro',
            html,
          });

          // 9. Guarda información de la notificación enviada
          notifications.push({
            user: user.email,
            topics: Object.entries(groupedByTopic).map(([topicName, comments]) => ({
              name: topicName,
              comments
            })),
          });

          strapi.log.info(`✅ Notificación enviada a ${user.email}`);
        } catch (err) {
          strapi.log.error(`❌ Error al enviar correo a ${user.email}`, err);
        }
      }
    }

    // 10. Retorna resumen de notificaciones enviadas
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
          <div style="margin-top: 15px; text-align: center;">
            <p style="font-size: 12px; color: #888;">En caso de detectar errores en esta notificación o requerir asistencia, puede comunicarse al correo <a href="mailto:scerdal@unap.cl">scerdal@unap.cl</a>.</p>
          </div>
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
