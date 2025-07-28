export default {
  routes: [
    {
      method: 'POST',
      path: '/topic/notifications/new-comments',
      handler: 'notifications.sendNotifications',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
