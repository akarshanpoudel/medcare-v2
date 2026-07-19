import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, ShieldOff, KeyRound, Loader2, AlertTriangle, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function StaffSecurity() {
  const [, navigate] = useLocation();
  const { staff, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const statusQuery = trpc.auth.totpStatus.useQuery(undefined, { enabled: !!staff });

  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);
  const [password, setPassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);

  const setupMutation = trpc.auth.setupTotp.useMutation({
    onSuccess: (data) => setSetupData(data),
    onError: (err) => toast.error(err.message),
  });

  const confirmMutation = trpc.auth.confirmTotpSetup.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetupData(null);
      void utils.auth.totpStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const disableMutation = trpc.auth.disableTotp.useMutation({
    onSuccess: () => {
      toast.success("Two-factor authentication turned off.");
      setShowDisable(false);
      setPassword("");
      void utils.auth.totpStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const regenerateMutation = trpc.auth.regenerateBackupCodes.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setShowRegenerate(false);
      setPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!authLoading && !staff) {
    navigate("/staff/login");
    return null;
  }
  if (authLoading || !staff || statusQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 px-6 py-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/staff/admin"
          className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to admin panel
        </Link>

        {/* Backup codes — shown once, right after setup or a regenerate */}
        {backupCodes && (
          <Card className="mb-4 border-amber-300 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="size-5 text-amber-600" /> Save your backup codes
              </CardTitle>
              <CardDescription>
                Each code works once, if you ever lose access to your authenticator app. They won't be shown again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-card p-4 font-mono text-sm">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join("\n"));
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="size-3.5" /> Copy codes
              </Button>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={savedAcknowledged}
                  onChange={(e) => setSavedAcknowledged(e.target.checked)}
                />
                I've saved these somewhere safe
              </label>
              <Button
                className="mt-3 w-full"
                disabled={!savedAcknowledged}
                onClick={() => {
                  setBackupCodes(null);
                  setSavedAcknowledged(false);
                }}
              >
                Done
              </Button>
            </CardContent>
          </Card>
        )}

        {!backupCodes && setupData && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Scan this QR code</CardTitle>
              <CardDescription>
                Use Google Authenticator, Authy, or any TOTP app. Then enter the 6-digit code it shows to confirm.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <img src={setupData.qrCodeDataUrl} alt="2FA setup QR code" className="size-48 rounded-md border" />
              <div className="w-full">
                <Label className="text-xs text-muted-foreground">Can't scan it? Enter this manually:</Label>
                <p className="mt-1 break-all rounded-md bg-muted p-2 font-mono text-xs">{setupData.secret}</p>
              </div>
              <form
                className="flex w-full flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmMutation.mutate({ code: confirmCode });
                }}
              >
                <Input
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.trim())}
                  placeholder="123456"
                  className="text-center font-mono text-lg tracking-[0.3em]"
                  maxLength={6}
                  autoFocus
                  required
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={confirmMutation.isPending} className="flex-1">
                    {confirmMutation.isPending ? "Confirming..." : "Confirm & enable"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSetupData(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {!backupCodes && !setupData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl">
                {statusQuery.data?.enabled ? (
                  <ShieldCheck className="size-5 text-primary" />
                ) : (
                  <ShieldOff className="size-5 text-muted-foreground" />
                )}
                Two-factor authentication
              </CardTitle>
              <CardDescription>
                {statusQuery.data?.enabled
                  ? "Enabled — a code from your authenticator app is required to sign in."
                  : "Add a second step at sign-in using an authenticator app, on top of your password."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!statusQuery.data?.enabled && (
                <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? "Starting setup..." : "Enable 2FA"}
                </Button>
              )}

              {statusQuery.data?.enabled && !showDisable && !showRegenerate && (
                <>
                  <Button variant="outline" onClick={() => setShowRegenerate(true)}>
                    <KeyRound className="size-4" /> Regenerate backup codes
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setShowDisable(true)}>
                    <ShieldOff className="size-4" /> Disable 2FA
                  </Button>
                </>
              )}

              {(showDisable || showRegenerate) && (
                <form
                  className="flex flex-col gap-3 rounded-md border p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (showDisable) disableMutation.mutate({ password });
                    else regenerateMutation.mutate({ password });
                  }}
                >
                  <Label htmlFor="confirm-password">Confirm your password to continue</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={disableMutation.isPending || regenerateMutation.isPending}>
                      {showDisable ? "Disable 2FA" : "Regenerate codes"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowDisable(false);
                        setShowRegenerate(false);
                        setPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
