/**
 * category controller
 */

import { factories } from '@strapi/strapi'



export default factories.createCoreController('api::category.category', ({ strapi }) => ({
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
      
      const entity = await strapi.entityService.findMany('api::category.category', query);
      return { data: entity?.[0] || null };
    },
}));