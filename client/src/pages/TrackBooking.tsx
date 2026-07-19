import { useState } from "react";
import { Link } from "wouter";
import { Search, Phone, ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CLINIC_PHONE } from "@shared/const";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function TrackBooking() {
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState<{ phone: string; reference: string } | null>(null);

  const trackQuery = trpc.appointments.track.useQuery(submitted!, {
    enabled: !!submitted,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-secondary/30 px-6 py-10">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to home
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Track your appointment</CardTitle>
            <CardDescription>
              Enter the phone number you booked with and the reference code from your confirmation to see your
              booking status. No account needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted({ phone: phone.trim(), reference: reference.trim() });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reference">Reference code</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value.toUpperCase())}
                  placeholder="e.g. 7K3M9PXQ"
                  className="font-mono uppercase"
                  required
                />
              </div>
              <Button type="submit" disabled={trackQuery.isFetching}>
                {trackQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Find my booking
              </Button>
            </form>
          </CardContent>
        </Card>

        {submitted && trackQuery.isError && (
          <Card className="mt-4 border-destructive/30">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {trackQuery.error.message}
              <br />
              Double-check the phone number and code, or call us at{" "}
              <a className="underline" href={`tel:${CLINIC_PHONE.replace(/\s/g, "")}`}>
                {CLINIC_PHONE}
              </a>
              .
            </CardContent>
          </Card>
        )}

        {trackQuery.data && (
          <div className="mt-4 flex flex-col gap-3">
            {trackQuery.data.map((apt) => (
              <Card key={apt.id}>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{apt.doctor}</p>
                    <Badge variant="outline" className={STATUS_STYLES[apt.status]}>
                      {apt.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{apt.department}</p>
                  <p className="text-sm">
                    {apt.appointmentDate} at {apt.appointmentTime.slice(0, 5)}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">Ref: {apt.reference}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
          <Phone className="size-3.5" /> Prefer to call? Reach us at {CLINIC_PHONE}
        </p>
      </div>
    </div>
  );
}
