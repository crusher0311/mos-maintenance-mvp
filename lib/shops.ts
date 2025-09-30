// lib/shops.ts
import { db } from "./mongo";
export async function getShopById(shopId: number) {
  return db.collection("shops").findOne({ shopId });
}
