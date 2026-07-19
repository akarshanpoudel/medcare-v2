import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Stethoscope,
  Smile,
  HeartPulse,
  HeartHandshake,
  Phone,
  MapPin,
  Clock,
  MessageCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCTORS, generateDaySlots, CLINIC_PHONE, CLINIC_WHATSAPP_NUMBER, CLINIC_ADDRESS } from "@shared/const";
import { bookingInputSchema } from "@shared/validation";
import { todayLocalISODate } from "@/lib/date";

const SERVICES = [
  { department: "General Medicine", icon: Stethoscope, blurb: "Everyday illness, checkups, and referrals." },
  { department: "Dental", icon: Smile, blurb: "Cleanings, fillings, and general dental care." },
  { department: "Gynecology", icon: HeartHandshake, blurb: "Women's health, prenatal and routine care." },
  { department: "Cardiology", icon: HeartPulse, blurb: "Heart health checkups and consultations." },
];

const ALL_SLOTS = generateDaySlots();
const MIN_DATE = todayLocalISODate();

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  doctorId: string;
  date: string;
  time: string;
  notes: string;
}

const EMPTY_FORM: FormState = { fullName: "", phone: "", email: "", doctorId: "", date: "", time: "", notes: "" };

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmedReference, setConfirmedReference] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const selectedDoctor = DOCTORS.find((d) => d.id === form.doctorId);

  const availabilityQuery = trpc.appointments.availability.useQuery(
    { doctorId: form.doctorId as (typeof DOCTORS)[number]["id"], date: form.date },
    { enabled: !!form.doctorId && !!form.date }
  );
  const takenSlots = new Set(availabilityQuery.data?.taken ?? []);

  const bookMutation = trpc.appointments.book.useMutation({
    onSuccess: (data) => {
      setConfirmedReference(data.reference);
      setForm(EMPTY_FORM);
      setErrors({});
      void utils.appointments.availability.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Something went wrong. Please try again.");
    },
  });

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Changing doctor or date invalidates whatever time was selected,
      // since availability differs per doctor/date.
      if (key === "doctorId" || key === "date") next.time = "";
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = bookingInputSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    bookMutation.mutate(result.data);
  }

  const whatsappHref = useMemo(() => {
    const text = encodeURIComponent("Hi, I'd like to ask about booking an appointment at MedCare Clinic.");
    return `https://wa.me/${CLINIC_WHATSAPP_NUMBER}?text=${text}`;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="font-display text-xl font-semibold text-primary">
            MedCare Clinic
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
            <a href="#services" className="hover:text-primary">
              Services
            </a>
            <a href="#doctors" className="hover:text-primary">
              Doctors
            </a>
            <Link href="/track" className="hover:text-primary">
              Track booking
            </Link>
          </nav>
          <Button asChild size="sm">
            <a href="#book">Book an appointment</a>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="border-b bg-secondary/40 px-6 py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6">
          <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Book a clinic appointment in Pokhara, without the phone tag.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Pick a doctor, pick a real open slot, and get a reference code you can use to check your appointment
            status any time — no account required.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#book">Book an appointment</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> Chat on WhatsApp
              </a>
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <span>{DOCTORS.length} specialist doctors</span>
            <span>{SERVICES.length} departments</span>
            <span>Same-day slots available</span>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-semibold">Services</h2>
          <p className="mt-2 text-muted-foreground">Comprehensive care across four departments.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <Card key={s.department}>
                <CardContent className="pt-6">
                  <s.icon className="size-8 text-primary" />
                  <h3 className="mt-4 font-semibold">{s.department}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Doctors */}
      <section id="doctors" className="border-y bg-secondary/40 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-semibold">Meet our doctors</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOCTORS.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-6 text-center">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 font-display text-xl font-semibold text-primary">
                    {d.name
                      .split(" ")
                      .slice(-1)[0]
                      .slice(0, 2)}
                  </div>
                  <h3 className="mt-4 font-semibold">{d.name}</h3>
                  <p className="text-sm text-muted-foreground">{d.department}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Booking form */}
      <section id="book" className="px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-semibold">Book an appointment</h2>
          <p className="mt-2 text-muted-foreground">Choose a doctor and a real open time slot below.</p>

          {confirmedReference ? (
            <Card className="mt-8 border-primary/30 bg-primary/5">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <CheckCircle2 className="size-10 text-primary" />
                <h3 className="text-xl font-semibold">Request sent</h3>
                <p className="max-w-sm text-muted-foreground">
                  We'll confirm by phone shortly. Save this reference code to check your status any time:
                </p>
                <p className="rounded-md bg-card px-4 py-2 font-mono text-lg font-semibold tracking-wider">
                  {confirmedReference}
                </p>
                <div className="mt-2 flex gap-3">
                  <Button variant="outline" onClick={() => setConfirmedReference(null)}>
                    Book another
                  </Button>
                  <Button asChild>
                    <Link href="/track">Track this booking</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-8">
              <CardContent className="pt-6">
                <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" error={errors.fullName} htmlFor="fullName">
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={(e) => updateField("fullName", e.target.value)}
                      />
                    </Field>
                    <Field label="Phone number" error={errors.phone} htmlFor="phone">
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="98XXXXXXXX"
                      />
                    </Field>
                  </div>

                  <Field label="Email (optional)" error={errors.email} htmlFor="email">
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                  </Field>

                  <Field label="Doctor" error={errors.doctorId} htmlFor="doctorId">
                    <Select value={form.doctorId} onValueChange={(v) => updateField("doctorId", v)}>
                      <SelectTrigger id="doctorId" className="w-full">
                        <SelectValue placeholder="Choose a doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCTORS.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} — {d.department}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Date" error={errors.date} htmlFor="date">
                      <Input
                        id="date"
                        type="date"
                        min={MIN_DATE}
                        value={form.date}
                        onChange={(e) => updateField("date", e.target.value)}
                      />
                    </Field>
                    <Field label="Time" error={errors.time} htmlFor="time">
                      <Select
                        value={form.time}
                        onValueChange={(v) => updateField("time", v)}
                        disabled={!form.doctorId || !form.date}
                      >
                        <SelectTrigger id="time" className="w-full">
                          <SelectValue
                            placeholder={
                              availabilityQuery.isFetching
                                ? "Checking availability..."
                                : !form.doctorId || !form.date
                                  ? "Pick a doctor and date first"
                                  : "Choose a time"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_SLOTS.map((slot) => (
                            <SelectItem key={slot} value={slot} disabled={takenSlots.has(slot)}>
                              {slot} {takenSlots.has(slot) ? "· booked" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Notes (optional)" error={errors.notes} htmlFor="notes">
                    <Textarea
                      id="notes"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      placeholder="Anything the doctor should know ahead of time"
                    />
                  </Field>

                  <Button type="submit" size="lg" disabled={bookMutation.isPending} className="mt-2">
                    {bookMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Request appointment
                    {selectedDoctor ? ` with ${selectedDoctor.name}` : ""}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Contact / footer */}
      <footer className="border-t bg-secondary/40 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-display text-lg font-semibold text-primary">MedCare Clinic</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <MapPin className="size-4" /> {CLINIC_ADDRESS}
              </span>
              <span className="flex items-center gap-2">
                <Phone className="size-4" />{" "}
                <a href={`tel:${CLINIC_PHONE.replace(/\s/g, "")}`} className="hover:text-foreground">
                  {CLINIC_PHONE}
                </a>
              </span>
              <span className="flex items-center gap-2">
                <Clock className="size-4" /> Sun–Fri, 9:00 AM – 5:00 PM
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:text-right">
            <Link href="/track" className="hover:text-foreground">
              Track an appointment
            </Link>
            <Link href="/staff/login" className="hover:text-foreground">
              Staff sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
