// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// .env に書いた情報を読み込みます
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 接続用のクライアントを作成
export const supabase = createClient(supabaseUrl, supabaseAnonKey);