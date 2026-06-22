import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useLogin } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

const features = [
  "Job postings",
  "Applicant tracking",
  "Interview scheduling",
  "Resume parsing",
  "Offer management",
  "Onboarding",
  "AI scoring",
  "Analytics",
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loginMutation = useLogin();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Surface the "session expired" notice when the auth interceptor redirected
  // here after a 401 (?expired=1). Strip the param so a refresh doesn't re-show it.
  useEffect(() => {
    if (searchParams.get("expired") === "1") {
      setSessionExpired(true);
      searchParams.delete("expired");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSessionExpired(false);
    try {
      const res = await loginMutation.mutateAsync({ email, password });
      if (res.success) {
        login(res.data.user, res.data.tokens);
        toast.success(`Welcome back, ${res.data.user.firstName}!`);
        navigate("/dashboard");
      } else {
        toast.error(res.error?.message || "Login failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Login failed. Check your credentials.");
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Briefcase className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold">EMP Recruit</span>
          </div>
          <h2 className="text-3xl font-bold leading-tight mb-4">
            Hire the best talent faster
          </h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Post jobs, track applicants, schedule interviews, parse resumes, and
            manage offers &mdash; all in one place.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                <span className="text-brand-100">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">EMP Recruit</span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to manage recruitment
            </p>

            {sessionExpired && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>Your session has expired. Please log in again.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Part of the EMP HRMS ecosystem
          </p>
        </div>
      </div>
    </div>
  );
}
