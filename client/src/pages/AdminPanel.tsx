import { useState } from "react";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { LogOut, ChevronLeft, ChevronRight, Phone, Mail, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

type StatusFilter = "all" | "pending" | "confirmed" | "rejected" | "cancelled";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function AdminPanel() {
  const [, navigate] = useLocation();
  const { staff, isLoading: authLoading, logout } = useAuth();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const utils = trpc.useUtils();

  const listQuery = trpc.appointments.list.useQuery(
    { page, pageSize, status: status === "all" ? undefined : status },
    { enabled: !!staff, placeholderData: (prev) => prev }
  );

  const confirmMutation = trpc.appointments.confirm.useMutation({
    onSuccess: () => {
      toast.success("Appointment confirmed");
      void utils.appointments.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const rejectMutation = trpc.appointments.reject.useMutation({
    onSuccess: () => {
      toast.success("Appointment rejected");
      void utils.appointments.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!authLoading && !staff) {
    navigate("/staff/login");
    return null;
  }

  if (authLoading || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPages = listQuery.data ? Math.max(1, Math.ceil(listQuery.data.total / pageSize)) : 1;

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-display text-lg font-semibold">MedCare Clinic — Staff</p>
            <p className="text-sm text-muted-foreground">Signed in as {staff.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">View site</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/staff/security">
                <ShieldCheck className="size-4" /> Security
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-6 flex flex-col gap-3">
          {listQuery.isLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {listQuery.data?.items.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No {status !== "all" ? status : ""} appointments.
              </CardContent>
            </Card>
          )}

          {listQuery.data?.items.map((apt) => (
            <Card key={apt.id}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{apt.patientName}</p>
                    <Badge variant="outline" className={STATUS_STYLES[apt.status]}>
                      {apt.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{apt.reference}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {apt.doctor} · {apt.department} · {apt.appointmentDate} at {apt.appointmentTime.slice(0, 5)}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" /> {apt.patientPhone}
                    </span>
                    {apt.patientEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3.5" /> {apt.patientEmail}
                      </span>
                    )}
                  </div>
                  {apt.notes && <p className="text-sm italic text-muted-foreground">"{apt.notes}"</p>}
                </div>
                {apt.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={confirmMutation.isPending}
                      onClick={() => confirmMutation.mutate({ id: apt.id })}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ id: apt.id })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {listQuery.data && listQuery.data.total > pageSize && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
