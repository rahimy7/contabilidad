-- migrations/add-assigned-users-to-rules.sql
-- Agregar campo para usuarios específicos en reglas de asignación

ALTER TABLE assignment_rules
ADD COLUMN IF NOT EXISTS assigned_user_ids INTEGER[] DEFAULT NULL;

-- Comentario explicativo
COMMENT ON COLUMN assignment_rules.assigned_user_ids IS 
'Array de IDs de usuarios específicos a los que se debe asignar. Si está configurado, solo estos usuarios recibirán asignaciones de esta regla.';

-- Índice para mejorar búsquedas
CREATE INDEX IF NOT EXISTS idx_assignment_rules_assigned_users 
ON assignment_rules USING GIN (assigned_user_ids);

-- Verificar que el campo se agregó correctamente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assignment_rules' 
    AND column_name = 'assigned_user_ids'
  ) THEN
    RAISE NOTICE '✅ Campo assigned_user_ids agregado exitosamente';
  ELSE
    RAISE EXCEPTION '❌ Error: Campo assigned_user_ids no fue agregado';
  END IF;
END $$;