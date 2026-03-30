import { createClient } from '@supabase/supabase-js'

// Client-side Supabase instance — uses the public anon key.
// Only used in src/** (frontend). Never import lib/supabase.ts here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
