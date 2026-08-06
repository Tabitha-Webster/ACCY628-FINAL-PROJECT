"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { roleHomePath, type UserRole } from "@/lib/constants";
import { DemoLoginSelector } from "@/components/DemoLoginSelector";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signError) {
      const msg = (signError.message || "").trim();
      setError(
        !msg || msg === "Invalid login credentials"
          ? "That email or password did not match. Try again or use a demo account."
          : msg
      );
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    const role = (profileData?.role as UserRole | undefined) ?? "manager";
    router.push(roleHomePath(role));
    router.refresh();
  }

  return (
    <div className="login-page-bg relative min-h-screen overflow-x-hidden">
      <div className="login-page-mesh pointer-events-none absolute inset-0" aria-hidden />
      <div className="login-page-geo pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-8 sm:py-10">
        <Image
          src="/images/servicesync-msp-logo.png?v=5"
          alt="ServiceSync MSP"
          width={1160}
          height={700}
          className="login-brand-logo mb-5 h-auto w-[min(100%,17.5rem)] object-contain sm:mb-6 sm:w-[19rem]"
          sizes="304px"
          priority
          unoptimized
        />

        <div className="login-card w-full overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_24px_60px_-28px_rgba(18,59,93,0.35)] backdrop-blur-md">
          <div className="space-y-5 p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">Access your ServiceSync workspace.</p>
            </div>

            {error ? (
              <div className="alert alert-error py-2.5 text-sm">
                <span>{error}</span>
              </div>
            ) : null}

            <form className="space-y-3.5" onSubmit={onSubmit}>
              <label className="form-control w-full">
                <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </span>
                <input
                  type="email"
                  className="input input-bordered h-11 w-full rounded-xl border-slate-200 bg-white focus:border-[#8fc5e3] focus:outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Password
                </span>
                <input
                  type="password"
                  className="input input-bordered h-11 w-full rounded-xl border-slate-200 bg-white focus:border-[#8fc5e3] focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button
                className="btn login-signin-btn mt-1 h-11 min-h-11 w-full rounded-xl border-none text-white"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <DemoLoginSelector
              onSelect={(demoEmail, demoPassword) => {
                setEmail(demoEmail);
                setPassword(demoPassword);
                setError(null);
              }}
            />

            <div className="relative py-1 text-center text-xs uppercase tracking-[0.16em] text-slate-400">
              <span className="relative z-10 bg-white/90 px-3">or</span>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
            </div>

            <Link href="/customer-signup" className="btn login-create-account-btn h-11 min-h-11 w-full rounded-xl">
              New Customer? Create an Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
