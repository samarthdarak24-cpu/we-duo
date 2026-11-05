"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@") || !email.includes(".")) {
      setErrorMsg("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error?.message ?? "Subscription failed. Please try again.");
        return;
      }
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
      setErrorMsg("Network error — please check your connection and try again.");
    }
  };

  return (
    <section className="relative py-20 bg-[#08090A] border-t border-[#23262A] overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#C5A46D]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
          Vehicle Intelligence Digest
        </span>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
          Subscribe to our newsletter
        </h2>
        <p className="mt-4 text-[14px] sm:text-[15px] text-[#7A8089] max-w-xl mx-auto leading-relaxed">
          Get weekly insights on vehicle verification algorithms, odometer fraud mitigation, automotive market trends and inspection standards.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 max-w-md mx-auto">
          {status === "success" ? (
            <div className="p-4 rounded-xl bg-[#17191C] border border-[#36B982]/40 text-[#36B982] flex items-center justify-center gap-2.5 animate-fade-up">
              <Icon name="CheckCircle2" size={18} />
              <span className="text-[13px] font-medium">
                Thank you for subscribing! Your verification briefing is confirmed.
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-2.5 p-1.5 rounded-full bg-[#111315] border border-[#23262A] shadow-inner focus-within:border-[#C5A46D]/70 transition-colors">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full px-5 py-3 bg-transparent text-[#F5F5F5] placeholder-[#7A8089] text-[13px] focus:outline-none"
                disabled={status === "loading"}
                aria-label="Email address"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#F5F5F5] hover:bg-[#FFFFFF] text-[#08090A] text-[12px] font-semibold uppercase tracking-[0.12em] transition-all duration-200 shadow-md active:scale-95 whitespace-nowrap flex items-center justify-center gap-1.5"
              >
                {status === "loading" ? (
                  <Icon name="Loader2" size={14} className="animate-spin" />
                ) : (
                  <>
                    <span>Subscribe</span>
                    <Icon name="ArrowRight" size={14} />
                  </>
                )}
              </button>
            </div>
          )}

          {status === "error" && (
            <p className="mt-2.5 text-[12px] text-[#D95757] font-medium">
              {errorMsg}
            </p>
          )}

          <p className="mt-3 text-[11px] text-[#7A8089]">
            We respect your privacy. No spam, ever. Unsubscribe anytime.
          </p>
        </form>
      </div>
    </section>
  );
}
