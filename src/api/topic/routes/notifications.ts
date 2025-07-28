export default {
  routes: [
    {
      method: 'POST',
      path: '/topic/notifications/new-comments',
      handler: 'notifications.sendNewCommentsNotifications',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/topic/notifications/new-topic',
      handler: 'notifications.sendNewTopicNotifications',
      config: {
        policies: [],
        auth: false,
      },
    },
  ],
};
