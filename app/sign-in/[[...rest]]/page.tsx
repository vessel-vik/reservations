import { SignIn } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex justify-center items-center py-24 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 min-h-screen">
            <SignIn path="/sign-in" />
        </div>
    );
}
