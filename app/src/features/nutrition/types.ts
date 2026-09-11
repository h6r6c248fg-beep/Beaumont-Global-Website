import type { Food, FoodLogEntry } from '@/types/database'

export type FoodLogEntryWithFood = FoodLogEntry & { foods: Food | null }
