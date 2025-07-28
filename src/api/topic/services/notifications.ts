import { subHours } from 'date-fns';

export default ({ strapi }) => ({
  async sendNewCommentsNotifications() {
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
      const userId = post.users_permissions_user?.id;
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
          users_permissions_user: { id: { $ne: +userId } },
          created_at: { $gt: yesterday },
        },
        populate: {
          topic: true,
          users_permissions_user: true,
        },
      }) as any[]; // 👈 Solución rápida
      
      if (userPosts.length > 0) {
        const groupedByTopic = {};
        userPosts.forEach(post => {
          const topicName = post.topic?.name || 'Tópico sin nombre';
          if (!groupedByTopic[topicName]) groupedByTopic[topicName] = [];
          groupedByTopic[topicName].push({
            author: post.users_permissions_user?.name+' '+post.users_permissions_user?.lastName+' '+post.users_permissions_user?.lastName2+' - '+post.users_permissions_user?.institution || 'Desconocido',
            body: post.body,
            date: post.created_at,
          });
        });

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

        await strapi.plugin('email').service('email').send({
          to: user.email,
          subject: 'Nuevos comentarios en el foro',
          html: html,
        });

        notifications.push({ user: user.email, topics: Object.keys(groupedByTopic) });
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
  


  /*
  async sendNewTopicNotifications() {
    // 👇 Lógica para cuando se crea un nuevo tópico
    const usersToNotify = await strapi.entityService.findMany('plugin::users-permissions.user', {
      // filters: { //filtros si los necesitas },
    });

    // Enviar correo a cada usuario con el nuevo tópico
    for (const user of usersToNotify) {

      let html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Hola ${user.name},</h2>
          <p style="font-size: 16px; color: #555;">
            Se ha creado un nuevo tópico en el foro del Corredor Bioceánico Tarapacá que podría interesarte:
          </p>

          <div style="margin-top: 30px; padding: 15px; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="color: #005fa3; margin-bottom: 10px;">${topic.title}</h3>
            <p style="margin: 0; color: #444;"><strong>Autor:</strong> ${topic.author}</p>
            <p style="margin-top: 10px; font-size: 15px; color: #555;"><strong>Descripción:</strong></p>
            <p style="margin: 5px 0 0 0; font-style: italic;">"${topic.description}"</p>
          </div>

          <div style="margin-top: 40px; text-align: center;">
            <p style="font-size: 16px; color: #333;">Puedes participar en el foro iniciando sesión en la plataforma:</p>
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

      await strapi.plugins['email'].services.email.send({
        to: user.email,
        subject: 'Nuevo tópico en el foro',
        html: `<p>Se ha creado un nuevo tópico en el foro. Inicia sesión para participar.</p>
               <p><a href="https://www.corredor-bioceanico-tarapaca.cl">Ir a la plataforma</a></p>`,
      });
    }

    return { status: 'ok', count: usersToNotify.length };
  },
  */
});
