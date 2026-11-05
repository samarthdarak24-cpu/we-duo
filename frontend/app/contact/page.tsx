import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { ContactForm } from "@/components/public/ContactForm";
import { Newsletter } from "@/components/public/Newsletter";
import { Icon } from "@/components/ui/Icon";

export const metadata = {
  title: "Contact Us — TrustDrive Support & Verification Operations",
  description:
    "Get in touch with TrustDrive for vehicle inspection inquiries, report disputes, enterprise API access, and customer support.",
};

export default function ContactPage() {
  const offices = [
    {
      city: "Mumbai Hub",
      address: "Level 14, Platina Tower, Bandra Kurla Complex (BKC)",
      phone: "+91 (022) 8000-8787",
      email: "mumbai.ops@trustdrive.dev",
    },
    {
      city: "Pune Technology Center",
      address: "Cybercity Magarpatta, Hadapsar, Pune, MH",
      phone: "+91 (020) 7000-1122",
      email: "pune.engineering@trustdrive.dev",
    },
    {
      city: "Bengaluru Verification Lab",
      address: "Indiranagar 100ft Road, Bengaluru, KA",
      phone: "+91 (080) 6000-9988",
      email: "bengaluru.lab@trustdrive.dev",
    },
  ];

  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Reach Out Directly
          </span>
          <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-white tracking-tight leading-tight max-w-3xl mx-auto">
            Contact TrustDrive.
          </h1>
          <p className="mt-4 text-[15px] sm:text-[16px] text-[#BFC3C8] max-w-xl mx-auto leading-relaxed">
            Our engineering, verification, and support specialists are standing by to assist with any platform or vehicle inquiry.
          </p>
        </div>

        {/* Working Form */}
        <ContactForm />

        {/* Regional Hubs (Matching Reference "Visit our showrooms / Reach us out directly") */}
        <section className="py-20 bg-[#08090A] border-t border-[#23262A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-display font-bold text-2xl text-white mb-8 text-center sm:text-left">
              Verification Centers & Operations
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {offices.map((office) => (
                <div key={office.city} className="p-6 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3">
                  <div className="flex items-center gap-2 text-[#C5A46D] font-mono text-[12px] uppercase">
                    <Icon name="Building2" size={16} />
                    <span>{office.city}</span>
                  </div>
                  <p className="text-[13px] text-[#BFC3C8] leading-relaxed">
                    {office.address}
                  </p>
                  <div className="pt-2 border-t border-[#23262A] text-[12px] font-mono space-y-1">
                    <div className="text-[#7A8089]">{office.phone}</div>
                    <div className="text-[#C5A46D]">{office.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
