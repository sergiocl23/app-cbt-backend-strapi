/**
 * subcategory controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::subcategory.subcategory', ({ strapi }) => ({
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
    
    const entity = await strapi.entityService.findMany('api::subcategory.subcategory', query);
    return { data: entity?.[0] || null };
  },

  async delete(ctx) {
    const { id } = ctx.params;
  
    // Check if the topic exists before deleting
    const subcategories = await strapi.entityService.findMany('api::subcategory.subcategory', {
      filters: { id },
      populate: '*'
    });
  
    const subcategory = subcategories[0];
  
    if (!subcategory) {
      return ctx.notFound('Subcategory not found');
    }
  
    // Delete the topic using the correct method signature
    const response = await strapi.entityService.delete('api::subcategory.subcategory', subcategory.id);
  
    return { data: response };
  },

  async update(ctx) {
    const { id } = ctx.params;
    const { data } = ctx.request.body;
    
    try {
      // Find the topic first
      const subcategories = await strapi.entityService.findMany('api::subcategory.subcategory', {
        filters: { id }
      });

      const subcategory = subcategories[0];
      if (!subcategory) {
        return ctx.notFound('Subcategory not found');
      }

      // Update using entityService
      const updatedSubcategory = await strapi.entityService.update('api::subcategory.subcategory', subcategory.id, {
        data: {
          ...data,
          publishedAt: new Date()
        }
      });

      return {
        data: updatedSubcategory
      };
    } catch (error) {
      console.error('Update error:', error);
      ctx.throw(500, error);
    }
  },
}));
