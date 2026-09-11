// Hand-written mirror of supabase/migrations/0001_init.sql.
// If you change the SQL schema, update this file (or swap it for a real
// `supabase gen types typescript` output once your project is linked).

export type CalendarProvider = 'google' | 'microsoft' | 'apple_caldav' | 'manual'
export type EmailProvider = 'gmail' | 'microsoft' | 'imap'
export type AiRole = 'user' | 'assistant' | 'system'
export type CompoundCategory = 'anabolic_steroid' | 'peptide' | 'ancillary' | 'sarm' | 'other'
export type CycleType = 'steroid' | 'peptide' | 'mixed'
export type CycleStatus = 'planned' | 'active' | 'completed' | 'discontinued'
export type AdministrationRoute = 'im' | 'subq' | 'oral' | 'topical' | 'nasal' | 'other'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type IntegrationProvider = 'orgview' | 'traderpro'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  timezone: string
  theme: string
  onboarded_at: string | null
  created_at: string
  updated_at: string
}

export interface CalendarAccount {
  id: string
  user_id: string
  provider: CalendarProvider
  display_name: string
  email: string | null
  color: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  caldav_url: string | null
  caldav_username: string | null
  caldav_app_password: string | null
  status: string
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  calendar_account_id: string | null
  external_id: string | null
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  all_day: boolean
  source: CalendarProvider
  color: string | null
  created_at: string
  updated_at: string
}

export interface EmailAccount {
  id: string
  user_id: string
  provider: EmailProvider
  display_name: string
  email_address: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  imap_host: string | null
  imap_port: number | null
  imap_username: string | null
  imap_app_password: string | null
  status: string
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

export interface EmailMessage {
  id: string
  user_id: string
  email_account_id: string
  external_id: string | null
  from_name: string | null
  from_address: string | null
  subject: string | null
  snippet: string | null
  received_at: string
  is_read: boolean
  is_starred: boolean
  folder: string
  created_at: string
}

export interface AiConversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface AiMessage {
  id: string
  conversation_id: string
  user_id: string
  role: AiRole
  content: string
  created_at: string
}

export interface Compound {
  id: string
  user_id: string | null
  name: string
  category: CompoundCategory
  default_unit: string
  half_life_hours: number | null
  notes: string | null
  is_custom: boolean
  created_at: string
}

export interface Cycle {
  id: string
  user_id: string
  name: string
  cycle_type: CycleType
  goal: string | null
  start_date: string
  end_date: string | null
  status: CycleStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CycleItem {
  id: string
  cycle_id: string
  user_id: string
  compound_id: string | null
  compound_name: string
  dose_amount: number
  dose_unit: string
  frequency: string
  route: AdministrationRoute
  start_date: string
  end_date: string | null
  notes: string | null
  created_at: string
}

export interface DoseLog {
  id: string
  user_id: string
  cycle_item_id: string
  logged_at: string
  amount: number
  unit: string
  injection_site: string | null
  taken: boolean
  notes: string | null
}

export interface BloodworkLog {
  id: string
  user_id: string
  cycle_id: string | null
  test_date: string
  lab_name: string | null
  panel: Record<string, number | string>
  notes: string | null
  created_at: string
}

export interface Food {
  id: string
  user_id: string | null
  name: string
  brand: string | null
  serving_size: number
  serving_unit: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  is_custom: boolean
  created_at: string
}

export interface FoodLogEntry {
  id: string
  user_id: string
  food_id: string
  log_date: string
  meal: MealType
  servings: number
  created_at: string
}

export interface NutritionTargets {
  user_id: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  updated_at: string
}

export interface BodyWeightLog {
  id: string
  user_id: string
  log_date: string
  weight_kg: number
  body_fat_pct: number | null
  notes: string | null
  created_at: string
}

export interface Exercise {
  id: string
  user_id: string | null
  name: string
  category: string
  primary_muscle: string | null
  equipment: string | null
  instructions: string | null
  is_custom: boolean
  created_at: string
}

export interface Routine {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
}

export interface RoutineExercise {
  id: string
  routine_id: string
  user_id: string
  exercise_id: string
  order_index: number
  target_sets: number
  target_reps: number
  target_weight_kg: number | null
}

export interface WorkoutSession {
  id: string
  user_id: string
  routine_id: string | null
  name: string
  started_at: string
  ended_at: string | null
  notes: string | null
  bodyweight_kg: number | null
  created_at: string
}

export interface WorkoutSet {
  id: string
  session_id: string
  user_id: string
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
  rpe: number | null
  is_warmup: boolean
  completed: boolean
  rest_seconds: number | null
  created_at: string
}

export interface Integration {
  id: string
  user_id: string
  provider: IntegrationProvider
  display_name: string
  api_base_url: string | null
  api_key: string | null
  status: string
  last_synced_at: string | null
  last_error: string | null
  config: Record<string, unknown>
  created_at: string
}

export interface IntegrationSnapshot {
  id: string
  integration_id: string
  user_id: string
  snapshot_date: string
  data: Record<string, unknown>
  created_at: string
}

type TableDef<Row extends object> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>
      calendar_accounts: TableDef<CalendarAccount>
      calendar_events: TableDef<CalendarEvent>
      email_accounts: TableDef<EmailAccount>
      email_messages: TableDef<EmailMessage>
      ai_conversations: TableDef<AiConversation>
      ai_messages: TableDef<AiMessage>
      compounds: TableDef<Compound>
      cycles: TableDef<Cycle>
      cycle_items: TableDef<CycleItem>
      dose_logs: TableDef<DoseLog>
      bloodwork_logs: TableDef<BloodworkLog>
      foods: TableDef<Food>
      food_log_entries: TableDef<FoodLogEntry>
      nutrition_targets: TableDef<NutritionTargets>
      body_weight_logs: TableDef<BodyWeightLog>
      exercises: TableDef<Exercise>
      routines: TableDef<Routine>
      routine_exercises: TableDef<RoutineExercise>
      workout_sessions: TableDef<WorkoutSession>
      workout_sets: TableDef<WorkoutSet>
      integrations: TableDef<Integration>
      integration_snapshots: TableDef<IntegrationSnapshot>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      calendar_provider: CalendarProvider
      email_provider: EmailProvider
      ai_role: AiRole
      compound_category: CompoundCategory
      cycle_type: CycleType
      cycle_status: CycleStatus
      administration_route: AdministrationRoute
      meal_type: MealType
      integration_provider: IntegrationProvider
    }
  }
}
