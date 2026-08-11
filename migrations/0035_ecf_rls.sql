-- Tenant isolation for the e-CF module.
--
-- Four of the five new tables are the taxpayer's own records and get the
-- standard policy. `ecf_simulator_inbox` deliberately does not: it stands in for
-- DGII, an outside party that holds submissions from every taxpayer at once, and
-- giving it a company_id would be modelling the fiction wrong. It is reachable
-- only through the simulator gateway, which runs outside the tenant scope for
-- exactly that reason — the same way the real DGII is not inside our database.
SELECT apply_tenant_policy('ecf_config');
--> statement-breakpoint
SELECT apply_tenant_policy('ecf_transmissions');
--> statement-breakpoint
SELECT apply_tenant_policy('ecf_received');
--> statement-breakpoint
SELECT apply_tenant_policy('ecf_sequence_voids');
--> statement-breakpoint

-- The private key is the one column in this schema that must never leave the
-- database. Revoking it from app_rls means a SELECT * in a handler cannot leak
-- it even by accident; the signer reads it through a SECURITY DEFINER function
-- that returns it only to the signing path.
REVOKE SELECT (certificate_private_key) ON ecf_config FROM app_rls;
--> statement-breakpoint

-- Hands the signing key to the signer without exposing the column to ordinary
-- reads. SECURITY DEFINER runs as the owner, so it sees past both the column
-- revoke and RLS — hence the explicit company check inside.
CREATE OR REPLACE FUNCTION ecf_signing_key(p_company_id integer)
RETURNS TABLE (private_key text, certificate text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS DISTINCT FROM current_company_id() THEN
    RAISE EXCEPTION 'ecf_signing_key: company % is not the active tenant', p_company_id;
  END IF;
  RETURN QUERY
    SELECT c.certificate_private_key, c.certificate_pem
      FROM ecf_config c
     WHERE c.company_id = p_company_id;
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION ecf_signing_key(integer) TO app_rls;
--> statement-breakpoint

-- The simulator is not tenant data; app_rls talks to it as it would to a remote
-- service, so it needs plain grants and no policy.
GRANT SELECT, INSERT, UPDATE ON ecf_simulator_inbox TO app_rls;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE ecf_simulator_inbox_id_seq TO app_rls;
