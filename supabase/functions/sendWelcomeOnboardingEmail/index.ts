// Send the welcome onboarding coupon email via Resend.
// Reads public.welcome_onboarding_rewards as an outbox; idempotent per row.
import { createClient } from "jsr:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function buildEmail(couponCode: string) {
  const subject =
    "Welcome to Prize-Manager — your free tournament upgrade coupon";
  const code = escapeHtml(couponCode);
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#111;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">Welcome to Prize-Manager</h1>
  <p>Thanks for signing up. As a welcome gift, here is a one-time coupon for a free tournament upgrade.</p>
  <p style="margin:24px 0;">
    <span style="display:inline-block;padding:12px 18px;border:1px dashed #1F6E5B;border-radius:6px;font-family:monospace;font-size:18px;font-weight:bold;color:#0B3D91;">${code}</span>
  </p>
  <ul style="line-height:1.6;">
    <li><strong>100% off</strong> a single tournament upgrade.</li>
    <li>Valid for one tournament that goes beyond the free 150-player threshold.</li>
    <li>One-time use, tied to your account.</li>
  </ul>
  <p>Apply it at upgrade time from your tournament page.</p>
  <p style="color:#666;font-size:12px;margin-top:32px;">Prize-Manager.com</p>
  </body></html>`;
  const text = [
    "Welcome to Prize-Manager",
    "",
    "Thanks for signing up. Here is a one-time coupon for a free tournament upgrade:",
    `  ${couponCode}`,
    "",
    "- 100% off a single tournament upgrade",
    "- Valid for one tournament beyond the free 150-player threshold",
    "- One-time use, tied to your account",
    "",
    "Apply it at upgrade time from your tournament page.",
  ].join("\n");
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const WELCOME_EMAIL_FROM = Deno.env.get("WELCOME_EMAIL_FROM");
  const WELCOME_EMAIL_REPLY_TO = Deno.env.get("WELCOME_EMAIL_REPLY_TO");

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(500, { ok: false, reason: "server_misconfigured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { ok: false, reason: "unauthorized" });
  }
  const token = authHeader.slice(7);

  // Auth client (uses caller JWT) — only to resolve the user.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await authClient.auth.getClaims(
    token,
  );
  if (claimsErr || !claims?.claims?.sub) {
    return json(401, { ok: false, reason: "unauthorized" });
  }
  const userId = claims.claims.sub as string;

  // Service-role client for outbox row mutations (bypasses RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: loadErr } = await admin
    .from("welcome_onboarding_rewards")
    .select("id, coupon_code, email, email_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadErr) {
    console.warn("[sendWelcomeOnboardingEmail] load_failed", {
      code: loadErr.code,
    });
    return json(500, { ok: false, reason: "load_failed" });
  }
  if (!row) {
    return json(200, { ok: true, status: "no_row" });
  }
  if (row.email_status === "sent") {
    return json(200, { ok: true, status: "already_sent" });
  }
  if (row.email_status !== "pending" && row.email_status !== "failed") {
    // 'sending' or unknown — don't double-fire.
    return json(200, { ok: true, status: row.email_status });
  }

  const recipient = row.email;
  if (!recipient) {
    await admin
      .from("welcome_onboarding_rewards")
      .update({ email_status: "failed", email_error: "missing_recipient" })
      .eq("id", row.id);
    return json(200, { ok: false, status: "failed", reason: "missing_recipient" });
  }
  if (!RESEND_API_KEY || !WELCOME_EMAIL_FROM) {
    return json(500, { ok: false, reason: "email_provider_unconfigured" });
  }

  // Mark as sending to prevent concurrent duplicates.
  const { error: lockErr } = await admin
    .from("welcome_onboarding_rewards")
    .update({ email_status: "sending", email_error: null })
    .eq("id", row.id)
    .in("email_status", ["pending", "failed"]);
  if (lockErr) {
    return json(500, { ok: false, reason: "lock_failed" });
  }

  const { subject, html, text } = buildEmail(row.coupon_code);
  const payload: Record<string, unknown> = {
    from: WELCOME_EMAIL_FROM,
    to: [recipient],
    subject,
    html,
    text,
  };
  if (WELCOME_EMAIL_REPLY_TO) payload.reply_to = WELCOME_EMAIL_REPLY_TO;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const respText = await resp.text();
    if (!resp.ok) {
      const summary = `resend_${resp.status}: ${respText.slice(0, 400)}`;
      await admin
        .from("welcome_onboarding_rewards")
        .update({ email_status: "failed", email_error: summary })
        .eq("id", row.id);
      console.warn("[sendWelcomeOnboardingEmail] provider_failed", {
        status: resp.status,
      });
      return json(200, { ok: false, status: "failed" });
    }
    await admin
      .from("welcome_onboarding_rewards")
      .update({
        email_status: "sent",
        email_sent_at: new Date().toISOString(),
        email_error: null,
      })
      .eq("id", row.id);
    return json(200, { ok: true, status: "sent" });
  } catch (err) {
    const summary = err instanceof Error ? err.message : "unknown_error";
    await admin
      .from("welcome_onboarding_rewards")
      .update({ email_status: "failed", email_error: summary.slice(0, 400) })
      .eq("id", row.id);
    return json(200, { ok: false, status: "failed" });
  }
});
