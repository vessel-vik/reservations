import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Doctors } from "@/constants";
import { getAppointment } from "@/lib/actions/appointment.actions";
import { formatDateTime } from "@/lib/utils";
import { extractPartySize } from "@/lib/export-utils";
import { CheckCircle, Calendar, Clock, Users, Sparkles, ArrowRight, PartyPopper, Wine } from "lucide-react";

const ReservationSuccess = async ({
  searchParams,
  params,
}: SearchParamProps) => {
  const searchParamsData = await searchParams;
  const { userId } = await params;
  const appointmentId = (searchParamsData?.appointmentId as string) || "";
  const appointment = await getAppointment(appointmentId);

  const welcomeDrink = Doctors.find(
    (drink) => drink.name === appointment?.primaryPhysician
  );

  if (!appointment) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">Loading reservation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Refined Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Celebration glow */}
        <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-green-500/8 to-green-600/4 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-amber-600/6 to-amber-500/3 rounded-full blur-[100px]" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(34,197,94,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(34,197,94,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <div className="flex items-center justify-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-green-400" />
                </div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-green-400 via-green-300 to-amber-400 bg-clip-text text-transparent">
                    Reservation Confirmed!
                  </span>
                </h1>
              </div>
            </Link>
          </div>

          {/* Success Animation */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <Image
                src="/assets/gifs/success.gif"
                height={180}
                width={180}
                unoptimized
                alt="Success"
                className="rounded-full"
              />
              <div className="absolute inset-0 rounded-full border-2 border-green-400/30" />
            </div>
          </div>

          {/* Glass Card with Details */}
          <div className="backdrop-blur-2xl bg-slate-900/50 rounded-3xl border border-slate-700/40 p-6 lg:p-8 shadow-2xl shadow-black/20 ring-1 ring-white/5">
            <div className="text-center mb-6">
              <h2 className="text-xl lg:text-2xl font-semibold text-white mb-2 tracking-tight">
                We Can't Wait to Serve You!
              </h2>
              <p className="text-slate-400 text-sm">
                Your table has been reserved at AM | PM Lounge
              </p>
            </div>

            {/* Reservation Details */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Date & Time</p>
                    <p className="text-white font-medium text-sm">
                      {formatDateTime(appointment.schedule).dateTime}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Party Size</p>
                    <p className="text-white font-medium text-sm">
                      {extractPartySize(appointment.partySize, appointment.note)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Welcome Drink Card */}
            <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                  <Wine className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-slate-400 text-xs mb-0.5">Complimentary Welcome Drink</p>
                  <p className="text-white font-medium">
                    {welcomeDrink?.name || "House Special"}
                  </p>
                  {welcomeDrink?.description && (
                    <p className="text-slate-500 text-xs mt-1">{welcomeDrink.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Special Message */}
            <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20 mb-6">
              <div className="flex items-center justify-center gap-3">
                <PartyPopper className="w-5 h-5 text-amber-400" />
                <p className="text-white text-sm">
                  <span className="font-semibold">Congratulations!</span> Your complimentary {welcomeDrink?.name || "welcome drink"} will be waiting for you!
                </p>
              </div>
            </div>

            {/* Important Information */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Please arrive 5 minutes before your reservation time</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Your table will be held for 15 minutes</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium"
                asChild
              >
                <Link href={`/guests/${userId}/new-appointment`} className="flex items-center justify-center gap-2">
                  Make Another Reservation
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                asChild
              >
                <Link href="/">
                  Return Home
                </Link>
              </Button>
            </div>
          </div>

          {/* Confirmation Number */}
          <div className="text-center mt-6">
            <p className="text-slate-500 text-sm">
              Confirmation #: <span className="text-amber-400 font-mono font-medium">{appointment.$id?.slice(0, 8).toUpperCase()}</span>
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 text-sm mt-8">
            © 2025 AM | PM Lounge · Premium Dining Experience
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReservationSuccess;