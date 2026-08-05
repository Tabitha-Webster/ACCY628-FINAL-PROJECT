-- Duplicate checks for customer self-signup (read-only; does not merge or delete).
-- Returns only boolean flags so callers cannot enumerate full customer/user lists.

CREATE OR REPLACE FUNCTION public.check_customer_signup_duplicates(
  p_email text,
  p_business_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  email_value text := nullif(lower(btrim(COALESCE(p_email, ''))), '');
  business_value text := nullif(
    regexp_replace(lower(btrim(COALESCE(p_business_name, ''))), '\s+', ' ', 'g'),
    ''
  );
  email_taken boolean := false;
  business_taken boolean := false;
BEGIN
  IF email_value IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE lower(u.email) = email_value
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(p.email) = email_value
    )
    INTO email_taken;
  END IF;

  IF business_value IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g') = business_value
         OR (
           c.customer_name IS NOT NULL
           AND regexp_replace(lower(btrim(c.customer_name)), '\s+', ' ', 'g') = business_value
         )
    )
    INTO business_taken;
  END IF;

  RETURN jsonb_build_object(
    'email_taken', COALESCE(email_taken, false),
    'business_name_taken', COALESCE(business_taken, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_customer_signup_duplicates(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_customer_signup_duplicates(text, text) TO anon, authenticated;
