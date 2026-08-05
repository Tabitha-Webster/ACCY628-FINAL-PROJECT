import Link from "next/link";

export default function CustomerSignupPage() {
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
          <div className="card bg-base-100 shadow-2xl">
            <div className="card-body gap-4">
              <div>
                <h2 className="card-title text-xl">New Customer Sign Up</h2>
                <p className="text-sm opacity-70">
                  Customer registration will be available here next. You can return to sign in
                  anytime.
                </p>
              </div>

              <div className="rounded-box border border-base-300 bg-base-200/60 p-4 text-sm opacity-80">
                The full signup form is not enabled yet. This page is ready for the customer
                registration flow.
              </div>

              <Link href="/login" className="btn btn-primary w-full">
                Back to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
