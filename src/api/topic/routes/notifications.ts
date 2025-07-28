export default {
  routes: [
    {
      method: 'GET',
      path: '/notifications/send-daily',
      handler: 'notification.sendDailyTopicNotifications',
      config: {
        policies: [],
        auth: false,
      },
    },
  ],
};
