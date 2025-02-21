/**
 * topic controller
 */

import { factories } from '@strapi/strapi'

// export default factories.createCoreController('api::topic.topic');

export default factories.createCoreController('api::topic.topic', ({ strapi }) => ({
    // Add the find method for getting all topics
    async find(ctx) {
      const { data, meta } = await super.find(ctx);
      return { data, meta };
    },

    async findOne(ctx) {
      const { id } = ctx.params;
      const query = {
        filters: {
          $or: [
            { id },
            { documentId: id }
          ]
        },
        ...ctx.query
      };
      
      const entity = await strapi.entityService.findMany('api::topic.topic', query);
      return { data: entity?.[0] || null };
    },

    async delete(ctx) {
      const { id } = ctx.params;
    
      const query = {
        filters: {
          $or: [{ id }, { documentId: id }]
        }
      };
    
      const entity = await strapi.entityService.findMany('api::topic.topic', query);
      const itemToDelete = entity?.[0];
    
      if (!itemToDelete) {
        return ctx.notFound();
      }
    
      const response = await strapi.entityService.delete('api::topic.topic', itemToDelete.id);
      return { data: response };
    },

    async update(ctx) {
      const { id } = ctx.params;
      const { data } = ctx.request.body;
      
      try {
        // Find the topic first
        const topics = await strapi.entityService.findMany('api::topic.topic', {
          filters: { id }
        });

        const topic = topics[0];
        if (!topic) {
          return ctx.notFound('Topic not found');
        }

        // Update using entityService
        const updatedTopic = await strapi.entityService.update('api::topic.topic', topic.id, {
          data: {
            ...data,
            publishedAt: new Date()
          }
        });

        return {
          data: updatedTopic
        };
      } catch (error) {
        console.error('Update error:', error);
        ctx.throw(500, error);
      }
    },

}));