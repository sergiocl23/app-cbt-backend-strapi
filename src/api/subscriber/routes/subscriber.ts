export default {
  routes: [
    {
      method: 'POST',
      path: '/subscribers/subscribe',
      handler: 'subscriber.subscribe',
      config: {
        auth: false
      }
    },
    {
      method: 'GET',
      path: '/subscribers/unsubscribe',
      handler: 'subscriber.unsubscribe',
      config: {
        auth: false
      }
    },
    // {
    //   method: 'POST',
    //   path: '/subscribers/:id/unsubscribe',
    //   handler: 'subscriber.unsubscribe',
    //   config: {
    //     auth: false
    //   }
    // },
    {
      method: 'GET',
      path: '/subscribers',
      handler: 'subscriber.find',
      config: {
        auth: false
      }
    }
  ]
};
