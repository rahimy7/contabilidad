-- Insertar créditos de IA para tienda 16 (MINI MARKET EL RUBIO)
INSERT INTO public.ai_credits (
  store_id, 
  total_credits, 
  used_credits, 
  available_credits, 
  is_enabled,
  cost_per_message,
  cost_per_order,
  cost_per_voice_note,
  created_at,
  updated_at
) VALUES (
  16,
  1000,
  0,
  1000,
  true,
  1,
  5,
  10,
  NOW(),
  NOW()
)
ON CONFLICT (store_id) DO UPDATE SET
  total_credits = 1000,
  available_credits = 1000,
  is_enabled = true,
  updated_at = NOW();

-- También para tienda 6 (MAS QUE SALUD)
INSERT INTO public.ai_credits (
  store_id,
  total_credits,
  used_credits,
  available_credits,
  is_enabled,
  cost_per_message,
  cost_per_order,
  cost_per_voice_note,
  created_at,
  updated_at
) VALUES (
  6,
  1000,
  0,
  1000,
  true,
  1,
  5,
  10,
  NOW(),
  NOW()
)
ON CONFLICT (store_id) DO UPDATE SET
  total_credits = 1000,
  available_credits = 1000,
  is_enabled = true,
  updated_at = NOW();

-- Y tienda 17 (Tienda Moda)
INSERT INTO public.ai_credits (
  store_id,
  total_credits,
  used_credits,
  available_credits,
  is_enabled,
  cost_per_message,
  cost_per_order,
  cost_per_voice_note,
  created_at,
  updated_at
) VALUES (
  17,
  1000,
  0,
  1000,
  true,
  1,
  5,
  10,
  NOW(),
  NOW()
)
ON CONFLICT (store_id) DO UPDATE SET
  total_credits = 1000,
  available_credits = 1000,
  is_enabled = true,
  updated_at = NOW();
