"use client";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-4 py-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="max-w-xl text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Managed services</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">ServiceSync MSP</h1>
          <p className="mt-3 text-lg text-cyan-50/90">
            From service agreement to support, billing, and collection.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-slate-200/90">
            Track customer contracts, support hours, technician work, costs, invoices, and payments
            in one place — so managers, technicians, billing staff, and customers each see what they
            need.
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="card bg-base-100 shadow-2xl">
            <div className="card-body gap-4">
              <div>
                <h2 className="card-title text-xl">Sign in</h2>
                <p className="text-sm opacity-70">Access your ServiceSync workspace</p>
              </div>

              {error ? (
                <div className="alert alert-error text-sm">
                  <span>{error}</span>
                </div>
              ) : null}

              <form className="space-y-3" onSubmit={onSubmit}>
                <label className="form-control w-full">
                  <span className="label-text mb-1">Email</span>
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
                  <span className="label-text mb-1">Password</span>
                  <input
                    type="password"
                    className="input input-bordered w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button className="btn btn-primary w-full" disabled={loading}>
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

              <p className="text-center text-sm opacity-70">
                Need an account?{" "}
                <Link href="/signup" className="link link-primary">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
