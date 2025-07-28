export default {
  routes: [
    {
      method: 'POST',
      path: '/topic/send-notifications',
      handler: 'notifications.sendNotifications',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
