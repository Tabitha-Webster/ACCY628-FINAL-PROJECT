-- Make system configuration readable for branding on login + in-app display.
DROP POLICY IF EXISTS "Authenticated can read system configuration" ON public.system_configuration;
DROP POLICY IF EXISTS "Public can read system configuration" ON public.system_configuration;
CREATE POLICY "Public can read system configuration"
ON public.system_configuration
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.allocate_document_number(p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  prefix text;
  seq integer;
  number_text text;
  prefix_key text;
  seq_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  CASE lower(p_kind)
    WHEN 'invoice' THEN
      prefix_key := 'invoicePrefix';
      seq_key := 'nextInvoiceSequence';
    WHEN 'contract' THEN
      prefix_key := 'contractPrefix';
      seq_key := 'nextContractSequence';
    WHEN 'ticket' THEN
      prefix_key := 'ticketPrefix';
      seq_key := 'nextTicketSequence';
    WHEN 'payment' THEN
      prefix_key := 'paymentPrefix';
      seq_key := 'nextPaymentSequence';
    ELSE
      RAISE EXCEPTION 'Unknown document kind: %', p_kind;
  END CASE;

  SELECT numbering INTO cfg
  FROM public.system_configuration
  WHERE id = 'default'
  FOR UPDATE;

  IF cfg IS NULL THEN
    cfg := '{}'::jsonb;
  END IF;

  prefix := coalesce(nullif(btrim(cfg ->> prefix_key), ''),
    CASE lower(p_kind)
      WHEN 'invoice' THEN 'INV-'
      WHEN 'contract' THEN 'CTR-'
      WHEN 'ticket' THEN 'TKT-'
      ELSE 'PMT-'
    END
  );

  BEGIN
    seq := greatest(1, floor(coalesce((cfg ->> seq_key)::numeric, 1001))::integer);
  EXCEPTION WHEN others THEN
    seq := 1001;
  END;

  number_text := prefix || seq::text;

  UPDATE public.system_configuration
  SET
    numbering = jsonb_set(coalesce(cfg, '{}'::jsonb), ARRAY[seq_key], to_jsonb(seq + 1), true),
    updated_at = now()
  WHERE id = 'default';

  RETURN number_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_document_sequence(p_kind text, p_used_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  prefix text;
  seq_key text;
  prefix_key text;
  suffix text;
  used_seq integer;
  current_seq integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  CASE lower(p_kind)
    WHEN 'invoice' THEN
      prefix_key := 'invoicePrefix';
      seq_key := 'nextInvoiceSequence';
    WHEN 'contract' THEN
      prefix_key := 'contractPrefix';
      seq_key := 'nextContractSequence';
    WHEN 'ticket' THEN
      prefix_key := 'ticketPrefix';
      seq_key := 'nextTicketSequence';
    WHEN 'payment' THEN
      prefix_key := 'paymentPrefix';
      seq_key := 'nextPaymentSequence';
    ELSE
      RETURN;
  END CASE;

  SELECT numbering INTO cfg
  FROM public.system_configuration
  WHERE id = 'default'
  FOR UPDATE;

  IF cfg IS NULL THEN
    RETURN;
  END IF;

  prefix := coalesce(nullif(btrim(cfg ->> prefix_key), ''), '');
  IF prefix = '' OR p_used_number IS NULL OR left(p_used_number, length(prefix)) <> prefix THEN
    RETURN;
  END IF;

  suffix := substr(p_used_number, length(prefix) + 1);
  IF suffix !~ '^\d+$' THEN
    RETURN;
  END IF;

  used_seq := suffix::integer;
  BEGIN
    current_seq := greatest(1, floor(coalesce((cfg ->> seq_key)::numeric, 1001))::integer);
  EXCEPTION WHEN others THEN
    current_seq := 1001;
  END;

  IF used_seq >= current_seq THEN
    UPDATE public.system_configuration
    SET
      numbering = jsonb_set(coalesce(cfg, '{}'::jsonb), ARRAY[seq_key], to_jsonb(used_seq + 1), true),
      updated_at = now()
    WHERE id = 'default';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewrite_document_number_prefixes(p_previous jsonb, p_next jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  old_prefix text;
  new_prefix text;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can rewrite document prefixes';
  END IF;

  -- Invoices
  old_prefix := coalesce(p_previous->>'invoicePrefix', 'INV-');
  new_prefix := coalesce(p_next->>'invoicePrefix', old_prefix);
  IF old_prefix <> new_prefix THEN
    UPDATE public.invoices
    SET invoice_number = new_prefix || substr(invoice_number, length(old_prefix) + 1)
    WHERE invoice_number LIKE old_prefix || '%';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    result := result || jsonb_build_object('invoice', updated_count);
  END IF;

  -- Contracts
  old_prefix := coalesce(p_previous->>'contractPrefix', 'CTR-');
  new_prefix := coalesce(p_next->>'contractPrefix', old_prefix);
  IF old_prefix <> new_prefix THEN
    UPDATE public.contracts
    SET contract_number = new_prefix || substr(contract_number, length(old_prefix) + 1)
    WHERE contract_number LIKE old_prefix || '%';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    result := result || jsonb_build_object('contract', updated_count);
  END IF;

  -- Tickets
  old_prefix := coalesce(p_previous->>'ticketPrefix', 'TKT-');
  new_prefix := coalesce(p_next->>'ticketPrefix', old_prefix);
  IF old_prefix <> new_prefix THEN
    UPDATE public.support_tickets
    SET ticket_number = new_prefix || substr(ticket_number, length(old_prefix) + 1)
    WHERE ticket_number LIKE old_prefix || '%';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    result := result || jsonb_build_object('ticket', updated_count);
  END IF;

  -- Payments
  old_prefix := coalesce(p_previous->>'paymentPrefix', 'PMT-');
  new_prefix := coalesce(p_next->>'paymentPrefix', old_prefix);
  IF old_prefix <> new_prefix THEN
    UPDATE public.payments
    SET payment_number = new_prefix || substr(payment_number, length(old_prefix) + 1)
    WHERE payment_number LIKE old_prefix || '%';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    result := result || jsonb_build_object('payment', updated_count);
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_document_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_document_sequence(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rewrite_document_number_prefixes(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.allocate_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_document_sequence(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rewrite_document_number_prefixes(jsonb, jsonb) TO authenticated;

-- Apply the already-saved invoice prefix (I-) to existing INV- rows so the UI matches Configurations.
DO $$
DECLARE
  inv_prefix text;
BEGIN
  SELECT coalesce(nullif(btrim(numbering->>'invoicePrefix'), ''), 'INV-')
  INTO inv_prefix
  FROM public.system_configuration
  WHERE id = 'default';

  IF inv_prefix IS DISTINCT FROM 'INV-' THEN
    UPDATE public.invoices
    SET invoice_number = inv_prefix || substr(invoice_number, 5)
    WHERE invoice_number LIKE 'INV-%';
  END IF;
END;
$$;
