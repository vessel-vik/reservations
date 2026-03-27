import Image from "next/image";
import { AppointmentForm } from "@/components/forms/AppointmentForm";
import { getPatient } from "@/lib/actions/guest.actions";
import { Calendar, Clock, Users, Sparkles, Utensils } from "lucide-react";

const NewReservation = async ({ params }: SearchParamProps) => {
  const { userId } = await params;
  const patient = await getPatient(userId);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Refined Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Primary ambient glow */}
        <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-500/8 to-amber-600/4 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-amber-600/6 to-amber-500/3 rounded-full blur-[100px]" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(251,191,36,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(251,191,36,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Left Section - Form */}
      <section className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-[640px]">
          {/* Premium Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                    Make a Reservation
                  </span>
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm">Secure your table at AM | PM Lounge</p>
              </div>
            </div>
          </div>

          {/* Glass Form Container */}
          <div className="backdrop-blur-2xl bg-slate-900/50 rounded-2xl sm:rounded-3xl border border-slate-700/40 p-5 sm:p-6 lg:p-8 shadow-2xl shadow-black/20 ring-1 ring-white/5">
            {patient && (
              <div className="mb-6 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-amber-400 text-sm font-medium">Welcome back, {patient.name}!</p>
                  <p className="text-slate-400 text-xs mt-0.5">Your preferences have been loaded</p>
                </div>
              </div>
            )}

            <AppointmentForm
              patientId={patient?.$id}
              userId={userId}
              type="create"
            />
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 text-sm mt-8">
            © 2025 AM | PM Lounge · Premium Dining Experience
          </p>
        </div>
      </section>

      {/* Right Section - Visual */}
      <section className="hidden lg:flex flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-slate-950/20 to-slate-950/80 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent z-10" />

        {/* Background Image */}
        <Image
          src="/assets/images/appointment-img.png"
          fill
          alt="Restaurant ambiance"
          className="object-cover"
          priority
        />

        {/* Overlay Content */}
        <div className="absolute inset-0 z-20 flex items-end justify-start p-10 lg:p-14">
          <div className="backdrop-blur-xl bg-slate-900/70 rounded-2xl p-6 lg:p-8 max-w-md border border-slate-700/50 shadow-xl">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-px bg-gradient-to-r from-amber-500 to-transparent" />
              <span className="text-amber-400/80 text-xs tracking-[0.2em] uppercase font-medium">
                Benefits
              </span>
            </div>

            <h3 className="text-xl lg:text-2xl font-semibold text-white mb-6 tracking-tight">Why Reserve With Us?</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 group-hover:border-amber-500/30 transition-all duration-300">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">Instant Confirmation</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Secure your table in seconds</p>
                </div>
              </div>

              <div className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 group-hover:border-amber-500/30 transition-all duration-300">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">VIP Treatment</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Personalized dining experience</p>
                </div>
              </div>

              <div className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 group-hover:border-amber-500/30 transition-all duration-300">
                  <Utensils className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">Special Perks</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Complimentary drinks & surprises</p>
                </div>
              </div>
            </div>

            {/* Operating Hours */}
            <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-white font-medium text-sm">Operating Hours</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500 text-xs mb-0.5">Weekdays</p>
                  <p className="text-slate-200">8:00 AM - 12:00 AM</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-0.5">Weekends</p>
                  <p className="text-slate-200">7:00 AM - 11:00 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NewReservation;