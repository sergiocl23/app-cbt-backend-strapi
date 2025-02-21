/**
 * post controller
 */

import { factories } from '@strapi/strapi'


export default factories.createCoreController('api::post.post', ({ strapi }) => ({
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
      
      const entity = await strapi.entityService.findMany('api::post.post', query);
      return { data: entity?.[0] || null };
    },

    async delete(ctx) {
      const { id } = ctx.params;
    
      const query = {
        filters: {
          $or: [{ id }, { documentId: id }]
        }
      };
    
      const entity = await strapi.entityService.findMany('api::post.post', query);
      const itemToDelete = entity?.[0];
    
      if (!itemToDelete) {
        return ctx.notFound();
      }
    
      // Pass the ID directly
      const response = await strapi.entityService.delete('api::post.post', itemToDelete.id);
    
      return { data: response };
    },

    async update(ctx) {
        const { id } = ctx.params;
        const { data } = ctx.request.body;
        
        try {
          // Find the post first
          const posts = await strapi.entityService.findMany('api::post.post', {
            filters: { id }
          });
  
          const post = posts[0];
          if (!post) {
            return ctx.notFound('Post not found');
          }
  
          // Update using entityService
          const updatedPost = await strapi.entityService.update('api::post.post', post.id, {
            data: {
              ...data,
              publishedAt: new Date()
            }
          });
  
          return {
            data: updatedPost
          };
        } catch (error) {
          console.error('Update error:', error);
          ctx.throw(500, error);
        }
    }
  }));