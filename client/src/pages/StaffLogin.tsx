import { useState } from "react";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function StaffLogin() {
  const [, navigate] = useLocation();
  const { staff, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (result) => {
      if (result.status === "totp_required") {
        setPendingToken(result.pendingToken);
        return;
      }
      void utils.auth.me.invalidate();
      navigate("/staff/admin");
    },
    onError: (err) => {
      toast.error(err.message || "Sign-in failed. Please try again.");
    },
  });

  const verifyTotpMutation = trpc.auth.verifyTotp.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
      navigate("/staff/admin");
    },
    onError: (err) => {
      toast.error(err.message || "That code didn't work. Please try again.");
      setCode("");
    },
  });

  if (!isLoading && staff) {
    navigate("/staff/admin");
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-6">
      <Card className="w-full max-w-sm">
        {pendingToken ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl">
                <ShieldCheck className="size-5 text-primary" /> Verification code
              </CardTitle>
              <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyTotpMutation.mutate({ pendingToken, code });
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    placeholder="123456"
                    className="text-center font-mono text-lg tracking-[0.3em]"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={11}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Lost your device? You can enter a backup code instead.</p>
                </div>
                <Button type="submit" disabled={verifyTotpMutation.isPending} className="mt-2">
                  {verifyTotpMutation.isPending ? "Verifying..." : "Verify"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPendingToken(null)}>
                  Back
                </Button>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Staff sign-in</CardTitle>
              <CardDescription>For clinic staff managing appointments.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  loginMutation.mutate({ email, password });
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loginMutation.isPending} className="mt-2">
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/" className="underline underline-offset-4 hover:text-foreground">
                  Back to the clinic site
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
