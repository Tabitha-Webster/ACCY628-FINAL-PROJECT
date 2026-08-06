"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { createClient } from "@/lib/supabase/client";

type FormValues = {
  customerName: string;
  industry: string;
  primaryContactName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = {
  customerName: "",
  industry: "",
  primaryContactName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DuplicateKind = "email" | "business";

function normalizeBusinessName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.customerName.trim()) {
    errors.customerName = "Business or customer name is required.";
  }
  if (!values.primaryContactName.trim()) {
    errors.primaryContactName = "Primary contact name is required.";
  }
  if (!values.email.trim()) {
    errors.email = "Email address is required.";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address (for example, name@company.com).";
  }
  if (!values.password) {
    errors.password = "Password is required.";
  } else if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (values.password && values.confirmPassword !== values.password) {
    errors.confirmPassword = "Password and confirm password must match.";
  }

  return errors;
}

async function findSignupDuplicates(
  supabase: ReturnType<typeof createClient>,
  email: string,
  businessName: string
): Promise<{ emailTaken: boolean; businessTaken: boolean }> {
  const normalizedBusiness = normalizeBusinessName(businessName);

  const { data: rpcData, error: rpcError } = await supabase.rpc("check_customer_signup_duplicates", {
    p_email: email,
    p_business_name: businessName,
  });

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const result = rpcData as { email_taken?: boolean; business_name_taken?: boolean };
    return {
      emailTaken: Boolean(result.email_taken),
      businessTaken: Boolean(result.business_name_taken),
    };
  }

  // Fallback when the duplicate-check RPC is not installed yet.
  const [{ data: profileMatches }, { data: customerRows }] = await Promise.all([
    supabase.from("profiles").select("id").ilike("email", email).limit(1),
    supabase.from("customers").select("id, name, customer_name").limit(500),
  ]);

  const emailTaken = (profileMatches?.length ?? 0) > 0;
  const businessTaken = (customerRows ?? []).some((row) => {
    const candidates = [row.name, row.customer_name].filter(Boolean) as string[];
    return candidates.some((candidate) => normalizeBusinessName(candidate) === normalizedBusiness);
  });

  return { emailTaken, businessTaken };
}

async function linkCustomerRecord(
  supabase: ReturnType<typeof createClient>,
  values: FormValues
): Promise<{ errorMessage: string | null }> {
  const payload = {
    p_customer_name: values.customerName.trim(),
    p_industry: values.industry.trim() || null,
    p_primary_contact_name: values.primaryContactName.trim(),
    p_email: values.email.trim().toLowerCase(),
    p_phone: values.phone.trim() || null,
  };

  const { error: rpcError } = await supabase.rpc("complete_customer_signup", payload);
  if (!rpcError) {
    return { errorMessage: null };
  }

  // Fallback if the RPC migration has not been applied yet — always pending_approval only.
  const customerInsert = await supabase
    .from("customers")
    .insert({
      name: payload.p_customer_name,
      industry: payload.p_industry,
      primary_contact: payload.p_primary_contact_name,
      contact_email: payload.p_email,
      primary_contact_phone: payload.p_phone,
      status: "pending_approval",
      customer_name: payload.p_customer_name,
      customer_status: "pending_approval",
      primary_contact_name: payload.p_primary_contact_name,
      primary_contact_email: payload.p_email,
      signup_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  let customerId = customerInsert.data?.id as string | undefined;
  let insertError = customerInsert.error;

  // Retry without optional columns if the live schema is missing them.
  if (insertError && /signup_at|customer_status|customer_name|primary_contact/i.test(insertError.message)) {
    const retry = await supabase
      .from("customers")
      .insert({
        name: payload.p_customer_name,
        industry: payload.p_industry,
        primary_contact: payload.p_primary_contact_name,
        contact_email: payload.p_email,
        primary_contact_phone: payload.p_phone,
        status: "pending_approval",
      })
      .select("id")
      .single();
    customerId = retry.data?.id;
    insertError = retry.error;
  }

  if (insertError || !customerId) {
    return {
      errorMessage:
        insertError?.message ||
        rpcError.message ||
        "Account was created, but the customer profile could not be saved as Pending Approval. Ask your administrator to apply the customer onboarding migration.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      errorMessage:
        "Account was created, but we could not link your customer profile yet. Please sign in after confirming your email.",
    };
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    email: payload.p_email,
    full_name: payload.p_primary_contact_name,
    role: "customer",
    customer_id: customerId,
    is_active: true,
    is_demo_user: false,
  });

  if (profileError) {
    return {
      errorMessage:
        profileError.message ||
        "Account was created, but linking your customer role failed. Contact your administrator.",
    };
  }

  return { errorMessage: null };
}

export default function CustomerSignupPage() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateKind, setDuplicateKind] = useState<DuplicateKind | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDuplicateKind(null);
    setSuccessMessage(null);
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const email = values.email.trim().toLowerCase();
    const businessName = values.customerName.trim();

    const duplicates = await findSignupDuplicates(supabase, email, businessName);
    if (duplicates.emailTaken) {
      setLoading(false);
      setDuplicateKind("email");
      setErrors((prev) => ({
        ...prev,
        email: "This email is already registered.",
      }));
      return;
    }
    if (duplicates.businessTaken) {
      setLoading(false);
      setDuplicateKind("business");
      setErrors((prev) => ({
        ...prev,
        customerName: "A customer with this business name already exists.",
      }));
      return;
    }

    const { data: signData, error: signError } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        data: {
          role: "customer",
          full_name: values.primaryContactName.trim(),
          primary_contact_name: values.primaryContactName.trim(),
          customer_name: businessName,
          industry: values.industry.trim() || null,
          phone: values.phone.trim() || null,
          email,
        },
      },
    });

    if (signError) {
      setLoading(false);
      const message = signError.message.toLowerCase();
      if (
        message.includes("already registered") ||
        message.includes("already been registered") ||
        message.includes("user already exists")
      ) {
        setDuplicateKind("email");
        setErrors((prev) => ({
          ...prev,
          email: "This email is already registered.",
        }));
        return;
      }
      setFormError(signError.message);
      return;
    }

    if (!signData.user) {
      setLoading(false);
      setFormError("Signup did not return a user. Please try again.");
      return;
    }

    // If we have a session, explicitly create/link the customer record as role=customer.
    // If email confirmation is required, the auth trigger (from the migration) uses metadata.
    if (signData.session) {
      const { errorMessage } = await linkCustomerRecord(supabase, values);
      setLoading(false);
      if (errorMessage) {
        setFormError(errorMessage);
        return;
      }
      router.push("/pending-approval");
      router.refresh();
      return;
    }

    setLoading(false);
    setSuccessMessage(
      "Account created successfully. Your registration is pending admin approval. Sign in after confirming your email (if required) to view your Pending Approval page."
    );
    setValues((prev) => ({ ...prev, password: "", confirmPassword: "" }));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-4 py-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="max-w-xl text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Managed services</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">ServiceSync MSP</h1>
          <p className="mt-3 text-lg text-cyan-50/90">
            From service agreement to support, billing, and collection.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-slate-200/90">
            Create a customer account to view contracts, submit support requests, track service
            usage, and manage invoices in one place.
          </p>
        </div>

        <div className="w-full max-w-md">
          <Card
            title="New Customer Sign Up"
            description="Register your organization. An admin must approve your account before you can use contracts, tickets, or billing."
            className="shadow-2xl"
          >
            <div className="space-y-4">
              {Object.keys(errors).length > 0 ? (
                <div className="alert alert-error text-sm">
                  <span>Please fix the highlighted fields below, then try again.</span>
                </div>
              ) : null}

              {formError ? (
                <div className="alert alert-error text-sm">
                  <span>{formError}</span>
                </div>
              ) : null}

              {duplicateKind === "email" ? (
                <div className="alert alert-warning text-sm">
                  <span>
                    An account with this email already exists. No new account was created.{" "}
                    <Link href="/login" className="link link-primary font-medium">
                      Go to Sign In
                    </Link>{" "}
                    to access your existing account.
                  </span>
                </div>
              ) : null}

              {duplicateKind === "business" ? (
                <div className="alert alert-warning text-sm">
                  <span>
                    A customer record with this business name already exists. No new customer was
                    created. Please contact the company for assistance instead of creating another
                    account.
                  </span>
                </div>
              ) : null}

              {successMessage ? (
                <div className="alert alert-success text-sm">
                  <span>{successMessage}</span>
                </div>
              ) : null}

              <form className="space-y-3" onSubmit={onSubmit} noValidate>
                <label className="form-control w-full">
                  <span className="label-text mb-1">
                    Business or customer name <span className="text-error">*</span>
                  </span>
                  <input
                    className={`input input-bordered w-full ${errors.customerName ? "input-error" : ""}`}
                    value={values.customerName}
                    onChange={(e) => updateField("customerName", e.target.value)}
                    autoComplete="organization"
                    disabled={loading || Boolean(successMessage)}
                  />
                  {errors.customerName ? (
                    <span className="mt-1 text-xs text-error">{errors.customerName}</span>
                  ) : null}
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">Industry</span>
                  <input
                    className="input input-bordered w-full"
                    value={values.industry}
                    onChange={(e) => updateField("industry", e.target.value)}
                    placeholder="Optional"
                    disabled={loading || Boolean(successMessage)}
                  />
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">
                    Primary contact name <span className="text-error">*</span>
                  </span>
                  <input
                    className={`input input-bordered w-full ${errors.primaryContactName ? "input-error" : ""}`}
                    value={values.primaryContactName}
                    onChange={(e) => updateField("primaryContactName", e.target.value)}
                    autoComplete="name"
                    disabled={loading || Boolean(successMessage)}
                  />
                  {errors.primaryContactName ? (
                    <span className="mt-1 text-xs text-error">{errors.primaryContactName}</span>
                  ) : null}
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">
                    Email address <span className="text-error">*</span>
                  </span>
                  <input
                    type="email"
                    className={`input input-bordered w-full ${errors.email ? "input-error" : ""}`}
                    value={values.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    autoComplete="email"
                    disabled={loading || Boolean(successMessage)}
                  />
                  {errors.email ? (
                    <span className="mt-1 text-xs text-error">{errors.email}</span>
                  ) : null}
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">Phone number</span>
                  <input
                    type="tel"
                    className="input input-bordered w-full"
                    value={values.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    autoComplete="tel"
                    placeholder="Optional"
                    disabled={loading || Boolean(successMessage)}
                  />
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">
                    Password <span className="text-error">*</span>
                  </span>
                  <input
                    type="password"
                    className={`input input-bordered w-full ${errors.password ? "input-error" : ""}`}
                    value={values.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    autoComplete="new-password"
                    disabled={loading || Boolean(successMessage)}
                  />
                  {errors.password ? (
                    <span className="mt-1 text-xs text-error">{errors.password}</span>
                  ) : null}
                </label>

                <label className="form-control w-full">
                  <span className="label-text mb-1">
                    Confirm password <span className="text-error">*</span>
                  </span>
                  <input
                    type="password"
                    className={`input input-bordered w-full ${errors.confirmPassword ? "input-error" : ""}`}
                    value={values.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                    autoComplete="new-password"
                    disabled={loading || Boolean(successMessage)}
                  />
                  {errors.confirmPassword ? (
                    <span className="mt-1 text-xs text-error">{errors.confirmPassword}</span>
                  ) : null}
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={loading || Boolean(successMessage)}
                >
                  {loading ? "Creating account…" : "Create Customer Account"}
                </Button>
              </form>

              <p className="text-center text-sm opacity-70">
                Already have an account?{" "}
                <Link href="/login" className="link link-primary">
                  Back to Sign In
                </Link>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
