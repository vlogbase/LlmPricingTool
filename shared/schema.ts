import { pgTable, text, serial, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Price Settings Table
export const priceSettings = pgTable("price_settings", {
  id: serial("id").primaryKey(),
  percentageMarkup: numeric("percentage_markup", { precision: 5, scale: 2 }).notNull().default("25"),
  flatFeeMarkup: numeric("flat_fee_markup", { precision: 5, scale: 2 }).notNull().default("0.2"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertPriceSettingsSchema = createInsertSchema(priceSettings);
export type InsertPriceSettings = z.infer<typeof insertPriceSettingsSchema>;
export type PriceSettings = typeof priceSettings.$inferSelect;

// For frontend type safety
export interface PriceSettingsDTO {
  id: number;
  percentageMarkup: number;
  flatFeeMarkup: number;
  lastUpdated: string;
}

// Users Table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  photoURL: text("photo_url"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  displayName: true,
  photoURL: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Models Table
export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  openRouterPrice: numeric("openrouter_price", { precision: 10, scale: 4 }).notNull(),
  suggestedPrice: numeric("suggested_price", { precision: 10, scale: 4 }).notNull(),
  actualPrice: numeric("actual_price", { precision: 10, scale: 4 }).notNull(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertModelSchema = createInsertSchema(models);
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof models.$inferSelect;

// For frontend type safety
export interface ModelPrice {
  id: string;
  name: string;
  provider: string;
  openRouterPrice: number;
  suggestedPrice: number;
  actualPrice: number;
  lastUpdated: string;
}

// API Keys Table
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  key: true,
  description: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// Scheduled Price Changes Table
export const scheduledPrices = pgTable("scheduled_prices", {
  id: serial("id").primaryKey(),
  modelId: text("model_id").notNull().references(() => models.id, { onDelete: 'cascade' }),
  scheduledPrice: numeric("scheduled_price", { precision: 10, scale: 4 }).notNull(),
  effectiveDate: timestamp("effective_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  applied: boolean("applied").notNull().default(false),
});

// Create schema with validation that converts numeric types appropriately
export const insertScheduledPriceSchema = createInsertSchema(scheduledPrices).pick({
  modelId: true,
  scheduledPrice: true,
  effectiveDate: true,
});

// Define a custom type that accepts either string or number for scheduledPrice
// but stores as string internally to match PostgreSQL
export type InsertScheduledPrice = {
  modelId: string;
  scheduledPrice: string | number;
  effectiveDate: string | Date;
};
export type ScheduledPrice = typeof scheduledPrices.$inferSelect;

// For frontend type safety
export interface ScheduledPriceDTO {
  id: number;
  modelId: string;
  modelName: string;
  provider: string;
  currentPrice: number;
  scheduledPrice: number;
  effectiveDate: string;
  applied: boolean;
}
