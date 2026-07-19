import { ENV } from "./env";

const SPARROW_SMS_URL = "https://api.sparrowsms.com/v2/sms/";

interface SparrowSuccessResponse {
  count: number;
  response_code: 200;
  response: string;
}
interface SparrowErrorResponse {
  response_code: number;
  response: string;
}

/**
 * Same rule as server/notifications.ts: sending an SMS NEVER throws. If
 * Sparrow SMS isn't configured, or the request fails, this logs and
 * returns false — it must never be able to turn a successful booking into
 * an error response to the patient.
 */
export async function sendSms(to: string, text: string): Promise<boolean> {
  if (!ENV.sparrowSmsToken || !ENV.sparrowSmsSenderId) {
    console.warn(`[sms] Sparrow SMS not configured — logging instead of sending.\nTo: ${to}\nText: ${text}\n`);
    return false;
  }

  // Sparrow SMS expects a bare 10-digit local number, not a +977-prefixed
  // one — strip any leading country code / punctuation a patient might
  // have typed.
  const localNumber = to.replace(/\D/g, "").replace(/^977/, "");

  try {
    const res = await fetch(SPARROW_SMS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: ENV.sparrowSmsToken,
        from: ENV.sparrowSmsSenderId,
        to: localNumber,
        text,
      }),
    });

    const data = (await res.json()) as SparrowSuccessResponse | SparrowErrorResponse;

    if (!res.ok || data.response_code !== 200) {
      console.error("[sms] Sparrow SMS rejected the request:", data);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[sms] send failed, continuing without it:", err);
    return false;
  }
}
