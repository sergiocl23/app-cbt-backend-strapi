/**
 * subscriber service
 */

export default ({ strapi }) => ({
  async createTestSubscribers(ctx) {
    try {
      const count = ctx.request.body?.count || 15;
      const subscribers = [];
      
      console.log('\n📝 Creando suscriptores de prueba:');
      console.log(`└── Objetivo: ${count} suscriptores`);

      for (let i = 0; i < count; i++) {
        const email = `test${Date.now()}${i}@test.com`;
        console.log(`└── Creando: ${email}`);

        const subscriber = await strapi.entityService.create('api::subscriber.subscriber', {
          data: {
            email,
            name: `Test User ${i}`,
            pais: i % 2 === 0 ? 'chile' : 'paraguay',
            isActive: true,
            frequency: 'monthly',
            publishedAt: new Date()
          }
        });
        
        subscribers.push(subscriber);
        console.log(`   ✅ Creado: ${subscriber.email}`);
      }

      console.log('\n📊 Resumen:');
      console.log(`└── Total creados: ${subscribers.length}`);
      console.log(`└── Países: ${subscribers.filter(s => s.pais === 'chile').length} Chile, ${subscribers.filter(s => s.pais === 'paraguay').length} Paraguay`);

      return {
        success: true,
        count: subscribers.length,
        subscribers: subscribers.map(s => ({
          id: s.id,
          email: s.email,
          pais: s.pais
        }))
      };

    } catch (error) {
      console.error('❌ Error creando suscriptores:', error);
      throw error;
    }
  }
});
