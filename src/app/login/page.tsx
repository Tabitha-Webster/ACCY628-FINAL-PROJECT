"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="login-page-bg relative min-h-screen overflow-x-hidden bg-slate-50">
      <div className="login-page-geo pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center px-4 py-6 sm:py-8 md:py-10">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-sky-700/80">
          Managed services
        </p>
        <h1 className="mt-3 w-full max-w-[min(100%,40rem)] sm:mt-4">
          <Image
            src="/images/servicesync-logo.png"
            alt="ServiceSync MSP"
            width={971}
            height={212}
            className="mx-auto h-auto w-full object-contain"
            sizes="(max-width: 640px) 94vw, 40rem"
            priority
          />
        </h1>
        <p className="mt-2 text-center text-base text-slate-700 sm:text-lg">
          From service agreement to support, billing, and collection.
        </p>
        <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-slate-600 sm:mt-4">
          Track customer contracts, support hours, technician work, costs, invoices, and payments
          in one place — so managers, technicians, billing staff, and customers each see what they
          need.
        </p>

        <div className="mt-5 w-full max-w-md sm:mt-6">
          <div className="card border border-slate-200/80 bg-white shadow-xl shadow-slate-200/70">
            <div className="card-body gap-3 p-5 sm:gap-3.5 sm:p-6">
              <div>
                <h2 className="card-title text-xl">Sign in</h2>
                <p className="text-sm opacity-70">Access your ServiceSync workspace</p>
              </div>

              {error ? (
                <div className="alert alert-error py-2 text-sm">
                  <span>{error}</span>
                </div>
              ) : null}

              <form className="space-y-2" onSubmit={onSubmit}>
                <label className="form-control w-full">
                  <span className="label-text mb-0.5">Email</span>
                  <input
                    type="email"
                    className="input input-bordered w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text mb-0.5">Password</span>
                  <input
                    type="password"
                    className="input input-bordered w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button className="btn btn-primary mt-2 w-full" disabled={loading}>
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

              <div className="divider my-0 text-xs opacity-50">or</div>

              <Link href="/customer-signup" className="btn btn-outline btn-primary w-full">
                New Customer? Create an Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
