import { TrialForm } from "@/components/trial-form";

export default function NewTrialPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">New trial</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Issue a 7-day trial license. Copy the key from the success screen and
        paste it into the lead&apos;s Telegram or Discord DM.
      </p>
      <div className="mt-6">
        <TrialForm />
      </div>
    </main>
  );
}
