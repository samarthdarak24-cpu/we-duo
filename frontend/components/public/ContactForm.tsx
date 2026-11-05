"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "General Inquiry",
    message: "",
  });

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setErrorMsg("Please provide your name.");
      setStatus("error");
      return;
    }

    if (!formData.email.trim() || !formData.email.includes("@")) {
      setErrorMsg("Please provide a valid email address.");
      setStatus("error");
      return;
    }

    if (!formData.message.trim()) {
      setErrorMsg("Please write your message.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error?.message ?? "Your message could not be sent. Please try again.");
        return;
      }
      setStatus("success");
      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "General Inquiry",
        message: "",
      });
    } catch {
      setStatus("error");
      setErrorMsg("Network error — please check your connection and try again.");
    }
  };

  return (
    <section id="contact" className="py-24 bg-[#08090A] border-t border-[#23262A] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Editorial Info */}
          <div className="lg:col-span-5 space-y-6">
            <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block">
              Get in Touch With Us
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight leading-tight">
              Let&apos;s Make Every Vehicle Decision Clearer.
            </h2>
            <p className="text-[14px] sm:text-[15px] text-[#7A8089] leading-relaxed">
              Have questions regarding vehicle document verification, institutional fleet inspection, API integration, or an active report dispute? Our engineering and compliance team is here to assist.
            </p>

            <div className="pt-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#111315] border border-[#23262A] flex items-center justify-center text-[#C5A46D] shrink-0 mt-0.5">
                  <Icon name="Mail" size={16} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#7A8089] font-mono">
                    Direct Email
                  </div>
                  <a
                    href="mailto:contact@trustdrive.dev"
                    className="text-[14px] font-medium text-[#F5F5F5] hover:text-[#C5A46D] transition-colors"
                  >
                    contact@trustdrive.dev
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#111315] border border-[#23262A] flex items-center justify-center text-[#C5A46D] shrink-0 mt-0.5">
                  <Icon name="Phone" size={16} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#7A8089] font-mono">
                    Verification Helpline
                  </div>
                  <span className="text-[14px] font-medium text-[#F5F5F5]">
                    +91 (022) 8000-8787
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#111315] border border-[#23262A] flex items-center justify-center text-[#C5A46D] shrink-0 mt-0.5">
                  <Icon name="MapPin" size={16} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#7A8089] font-mono">
                    Technology Operations
                  </div>
                  <span className="text-[14px] font-medium text-[#F5F5F5]">
                    Bandra Kurla Complex, Mumbai, MH, India
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[#23262A] bg-[#111315] p-6 sm:p-8 shadow-2xl relative">
              <h3 className="font-display font-semibold text-xl text-white mb-6">
                Send Us a Message
              </h3>

              {status === "success" ? (
                <div className="p-8 text-center rounded-xl bg-[#17191C] border border-[#36B982]/40 space-y-3 animate-fade-up">
                  <div className="w-12 h-12 rounded-full bg-[#36B982]/15 border border-[#36B982]/40 text-[#36B982] flex items-center justify-center mx-auto">
                    <Icon name="CheckCircle2" size={24} />
                  </div>
                  <h4 className="font-display text-[18px] font-bold text-white">
                    Message Received
                  </h4>
                  <p className="text-[13px] text-[#7A8089] max-w-sm mx-auto">
                    Thank you for reaching out. A TrustDrive verification specialist will review your inquiry and follow up within 24 business hours.
                  </p>
                  <button
                    onClick={() => setStatus("idle")}
                    className="mt-4 px-6 py-2 rounded-full bg-[#17191C] border border-[#23262A] text-[12px] font-semibold text-[#BFC3C8] hover:text-white"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] uppercase font-mono tracking-wider text-[#7A8089] mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. John Carter"
                        required
                        className="w-full px-4 py-2.5 rounded-lg bg-[#17191C] border border-[#23262A] text-[#F5F5F5] placeholder-[#7A8089]/60 text-[13px] focus:outline-none focus:border-[#C5A46D] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase font-mono tracking-wider text-[#7A8089] mb-1.5">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@example.com"
                        required
                        className="w-full px-4 py-2.5 rounded-lg bg-[#17191C] border border-[#23262A] text-[#F5F5F5] placeholder-[#7A8089]/60 text-[13px] focus:outline-none focus:border-[#C5A46D] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] uppercase font-mono tracking-wider text-[#7A8089] mb-1.5">
                        Phone Number (Optional)
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+91 98765 43210"
                        className="w-full px-4 py-2.5 rounded-lg bg-[#17191C] border border-[#23262A] text-[#F5F5F5] placeholder-[#7A8089]/60 text-[13px] focus:outline-none focus:border-[#C5A46D] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase font-mono tracking-wider text-[#7A8089] mb-1.5">
                        Subject
                      </label>
                      <select
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg bg-[#17191C] border border-[#23262A] text-[#F5F5F5] text-[13px] focus:outline-none focus:border-[#C5A46D] transition-colors"
                      >
                        <option value="General Inquiry">General Inquiry</option>
                        <option value="Vehicle Inspection">Vehicle Inspection Request</option>
                        <option value="Document Dispute">Document / Finding Dispute</option>
                        <option value="Seller Listing Support">Seller Listing Support</option>
                        <option value="API & Enterprise">API & Enterprise Integration</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-mono tracking-wider text-[#7A8089] mb-1.5">
                      Message *
                    </label>
                    <textarea
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Write your message here..."
                      required
                      className="w-full px-4 py-2.5 rounded-lg bg-[#17191C] border border-[#23262A] text-[#F5F5F5] placeholder-[#7A8089]/60 text-[13px] focus:outline-none focus:border-[#C5A46D] transition-colors resize-none"
                    />
                  </div>

                  {status === "error" && (
                    <p className="text-[12px] text-[#D95757] font-medium">{errorMsg}</p>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#F5F5F5] hover:bg-[#FFFFFF] text-[#08090A] text-[12px] font-semibold uppercase tracking-[0.12em] transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      {status === "loading" ? (
                        <>
                          <Icon name="Loader2" size={15} className="animate-spin" />
                          <span>Transmitting...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Message</span>
                          <Icon name="ArrowRight" size={15} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
