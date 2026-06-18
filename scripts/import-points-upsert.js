/**
 * scripts/import-points-upsert.js
 * Ejecuta: node scripts/import-points-upsert.js ./data/points.csv
 *
 * UPSERT por name:
 * - Si ya existe un point con el mismo name -> UPDATE
 * - Si no existe -> CREATE
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

async function bootstrapStrapi() {
  const { createStrapi } = require("@strapi/strapi");
  const appDir = process.cwd();
  const distDir = path.join(appDir, "dist");
  const app = await createStrapi({ appDir, distDir }).load();
  await app.server.mount();
  return app;
}


function readCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";", // tu CSV usa ;
  });
}

function toBool(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "si";
}

function toNumber(value, fieldName) {
  const n = Number(String(value ?? "").trim());
  if (Number.isNaN(n)) throw new Error(`Campo ${fieldName} inválido: "${value}"`);
  return n;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Uso: node scripts/import-points-upsert.js <ruta.csv>");
    process.exit(1);
  }

  const strapi = await bootstrapStrapi();

  const pointUID = "api::point.point";
  const catUID = "api::points-category.points-category";

  const rows = readCsv(path.resolve(csvPath));

  // Cache para no consultar la misma categoría mil veces
  const categoryCache = new Map(); // key: name -> id

  let created = 0,
    updated = 0,
    fail = 0;

  for (const row of rows) {
    console.log(row)
    try {
      const pointName = String(row.name ?? "").trim();
      if (!pointName) throw new Error("Falta campo name");

      const categoryName = String(row.category_name ?? "").trim();
      if (!categoryName) throw new Error("Falta campo category_name");

      // 1) Resolver categoría por nombre (con cache)
      let categoryId = categoryCache.get(categoryName);
      if (!categoryId) {
        const category = await strapi.db.query(catUID).findOne({
          where: { name: categoryName },
          select: ["id"],
        });
        if (!category) throw new Error(`No existe categoría con name="${categoryName}"`);
        categoryId = category.id;
        categoryCache.set(categoryName, categoryId);
      }

      // 2) Armar data
      const data = {
        name: pointName,
        description: row.description ?? "",
        latitude: toNumber(row.latitude, "latitude"),
        longitude: toNumber(row.longitude, "longitude"),
        visible: toBool(row.visible),
        id_categories: [categoryId], // manyToMany pero tú usas 1
      };

      // 3) Buscar si existe por name
      const existing = await strapi.db.query(pointUID).findOne({
        where: { name: pointName },
        select: ["id"],
      });

      if (existing) {
        await strapi.entityService.update(pointUID, existing.id, { data });
        updated++;
      } else {
        await strapi.entityService.create(pointUID, { data });
        created++;
      }
    } catch (e) {
      fail++;
      console.error(`❌ Error (${row.name ?? "SIN NAME"}): ${e.message}`);
    }
  }

  console.log(`✅ Listo. CREATED=${created} UPDATED=${updated} FAIL=${fail}`);
  await strapi.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
