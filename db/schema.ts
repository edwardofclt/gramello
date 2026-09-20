import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const goals = sqliteTable("goals", {
  userId: text("user_id").primaryKey(),
  calories: integer("calories").notNull().default(2400),
  protein: integer("protein").notNull().default(180),
  carbs: integer("carbs").notNull().default(250),
  fat: integer("fat").notNull().default(70),
  updatedAt: text("updated_at").notNull(),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), entryDate: text("entry_date").notNull(), meal: text("meal").notNull(),
  foodName: text("food_name").notNull(), brand: text("brand"), source: text("source").notNull(), sourceId: text("source_id"),
  quantity: real("quantity").notNull(), unit: text("unit").notNull(), grams: real("grams"), verified: integer("verified", { mode: "boolean" }).notNull().default(false), sourceUrl: text("source_url"), servingLabel: text("serving_label"), calories: real("calories").notNull(),
  protein: real("protein").notNull(), carbs: real("carbs").notNull(), fat: real("fat").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_entries_user_date").on(table.userId, table.entryDate)]);


export const foods = sqliteTable("foods", {
  id: text("id").primaryKey(), name: text("name").notNull(), brand: text("brand"),
  source: text("source").notNull(), sourceKind: text("source_kind").notNull(), sourceUrl: text("source_url"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  nutritionBasis: text("nutrition_basis").notNull(), servingGrams: real("serving_grams"), servingLabel: text("serving_label").notNull(),
  calories: real("calories").notNull(), protein: real("protein").notNull(), carbs: real("carbs").notNull(), fat: real("fat").notNull(),
  image: text("image"), createdBy: text("created_by"), checkedAt: text("checked_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_foods_name").on(table.name), index("idx_foods_brand").on(table.brand)]);
