console.log('🛣️ Cargando rutas de newsletter');

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/newsletters/:id/status',
      handler: 'api::newsletter.newsletter.getStatus',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      method: 'POST',
      path: '/newsletters/:id/cancel',
      handler: 'api::newsletter.newsletter.cancel',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      method: 'POST',
      path: '/newsletters/envio-directo',
      handler: 'newsletter.envioDirecto',
      config: {
        auth: false,
        policies: [],
        description: 'Enviar newsletter directamente sin usar el sistema de cola',
        tag: {
          plugin: 'newsletter',
          name: 'Newsletter',
          actionType: 'create'
        }
      }
    }
  ]
};

console.log('✅ Rutas de newsletter cargadas'); 