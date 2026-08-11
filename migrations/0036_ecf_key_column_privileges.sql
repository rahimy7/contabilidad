-- Hace efectiva la restricción sobre la llave privada del certificado.
--
-- La 0035 intentó `REVOKE SELECT (certificate_private_key)`, que no hace nada:
-- en PostgreSQL un permiso otorgado a nivel de *tabla* no se puede recortar por
-- columna. La 0002 concedió SELECT sobre todas las tablas a app_rls, así que la
-- revocación de columna se aplicó sobre un permiso que no existía a ese nivel y
-- el privilegio de tabla siguió mandando.
--
-- Lo correcto es al revés: quitar el SELECT de tabla y devolverlo columna por
-- columna, salteando la llave. Se hace en plpgsql sobre el catálogo para que
-- agregar una columna mañana no vuelva a exponerla — un GRANT con la lista
-- escrita a mano es exactamente el tipo de cosa que se queda desactualizada.
DO $$
DECLARE
  cols text;
BEGIN
  REVOKE SELECT ON ecf_config FROM app_rls;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'ecf_config'
     AND column_name <> 'certificate_private_key';

  EXECUTE format('GRANT SELECT (%s) ON ecf_config TO app_rls', cols);

  -- Escribir sí: cargar el certificado ocurre en una petición normal. Lo que no
  -- puede es volver a leerlo, ni siquiera con un SELECT *.
  EXECUTE 'GRANT INSERT, UPDATE ON ecf_config TO app_rls';
END;
$$;
--> statement-breakpoint

-- Las privilegios por defecto de la 0002 volverían a conceder SELECT de tabla
-- a cualquier tabla nueva, pero no reabren ésta: aplican sólo en la creación.
-- Aun así conviene dejar constancia de que este GRANT es intencionalmente
-- parcial, para que un `GRANT SELECT ON ALL TABLES` futuro no lo deshaga en
-- silencio sin que nadie lo note.
COMMENT ON COLUMN ecf_config.certificate_private_key IS
  'Llave privada de firma. SELECT revocado para app_rls a propósito: se lee sólo por ecf_signing_key() (SECURITY DEFINER). No conceder SELECT de tabla sobre ecf_config.';
