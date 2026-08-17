// Drain public.payment_notification_outbox and send payment lifecycle emails via Resend.
// Invoked by a scheduler, not by a user: auth is a shared secret in x-notify-secret.
// Never logs the secret, the recipient address, or the UTR.
import { createClient } from "jsr:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

// Constant-time secret comparison. Both sides are hashed first so that a length
// difference doesn't short-circuit the byte loop.
async function secretMatches(presented: string, expected: string) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(presented)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

type OutboxRow = {
  id: string;
  payment_id: string;
  tournament_id: string;
  action: string;
  recipient_email: string | null;
  review_note: string | null;
  return_to: string | null;
  attempts: number;
};

// return_to goes straight into an email link, so re-check it here rather than
// trusting the column constraint alone: a same-site relative path only, never
// an absolute or protocol-relative URL.
const safeReturnTo = (v: string | null): string | null =>
  v && v.length <= 500 && /^\/[^/\\]/.test(v) ? v : null;

type BuiltEmail = { subject: string; html: string; text: string };

// Returns null for any action this function does not explicitly know how to
// render. Before F2 that was unreachable: the outbox action CHECK only
// permitted 'approved' and 'rejected', so the constraint was doing the work of
// a default branch. F2 widens that CHECK, so the guard has to live here.
function buildEmail(row: OutboxRow, appBaseUrl: string): BuiltEmail | null {
  const base = appBaseUrl.replace(/\/+$/, "");
  const returnTo = safeReturnTo(row.return_to);

  // Oversight notice to the platform owner when the F2 gate approved a payment
  // with no human in the loop (PRD F2-4). The recipient is set by the RPC that
  // enqueues the row, not here. Deliberately carries no UTR.
  if (row.action === "auto_approved") {
    const link = `${base}/admin/payments`;
    const safeLink = escapeHtml(link);
    const subject = "A tournament payment was auto-approved";
    const noteHtml = row.review_note
      ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #1F6E5B;background:#F0FDF4;">${escapeHtml(row.review_note)}</p>`
      : "";
    const html =
      `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#111;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">A tournament payment was auto-approved</h1>
  <p>All eight payment invariants returned <strong>pass</strong>, the payer met the profile gate, and the auto-approval flag was on. Pro was unlocked without review.</p>
  <p style="color:#666;font-size:13px;">Payment <code>${escapeHtml(row.payment_id)}</code><br>Tournament <code>${escapeHtml(row.tournament_id)}</code></p>
  ${noteHtml}
  <p>This is a post-hoc notice, not a request. Review it if you want to; nothing is waiting on you.</p>
  <p style="margin:24px 0;">
    <a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#1F6E5B;border-radius:6px;color:#ffffff;text-decoration:none;font-weight:bold;">Open the payments admin</a>
  </p>
  <p style="color:#666;font-size:12px;">If the button doesn't work, paste this into your browser:<br>${safeLink}</p>
  <p style="color:#666;font-size:12px;margin-top:32px;">Prize-Manager.com</p>
  </body></html>`;
    const text = [
      "A tournament payment was auto-approved",
      "",
      "All eight payment invariants returned pass, the payer met the profile gate,",
      "and the auto-approval flag was on. Pro was unlocked without review.",
      "",
      `Payment:    ${row.payment_id}`,
      `Tournament: ${row.tournament_id}`,
      ...(row.review_note ? ["", row.review_note] : []),
      "",
      "This is a post-hoc notice, not a request.",
      "",
      "Open the payments admin:",
      `  ${link}`,
      "",
      "Prize-Manager.com",
    ].join("\n");
    return { subject, html, text };
  }

  if (row.action === "approved") {
    // Deep-link back to where the organizer was blocked, if we know it.
    const link = returnTo
      ? `${base}${returnTo}`
      : `${base}/t/${row.tournament_id}/setup?tab=details`;
    const safeLink = escapeHtml(link);
    const subject = "Your tournament upgrade is approved";
    const html =
      `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#111;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">Your tournament upgrade is approved</h1>
  <p>We've confirmed your payment. The Pro features are now active on your tournament.</p>
  <p>You can go straight back to your tournament and carry on where you left off.</p>
  <p style="margin:24px 0;">
    <a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#1F6E5B;border-radius:6px;color:#ffffff;text-decoration:none;font-weight:bold;">Open your tournament</a>
  </p>
  <p style="color:#666;font-size:12px;">If the button doesn't work, paste this into your browser:<br>${safeLink}</p>
  <p style="color:#666;font-size:12px;margin-top:32px;">Prize-Manager.com</p>
  </body></html>`;
    const text = [
      "Your tournament upgrade is approved",
      "",
      "We've confirmed your payment. The Pro features are now active on your tournament.",
      "",
      "Open your tournament:",
      `  ${link}`,
      "",
      "Prize-Manager.com",
    ].join("\n");
    return { subject, html, text };
  }

  if (row.action !== "rejected") {
    // Unknown action. Fail closed: send nothing. Falling through to the
    // rejection template would tell someone their payment was refused when it
    // was not.
    return null;
  }

  // Carry return_to through the resubmission so the deep link survives a retry.
  const link = returnTo
    ? `${base}/t/${row.tournament_id}/payment?return_to=${encodeURIComponent(returnTo)}`
    : `${base}/t/${row.tournament_id}/payment`;
  const safeLink = escapeHtml(link);
  const subject = "Your tournament payment needs another look";
  const reasonHtml = row.review_note
    ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #B45309;background:#FFF7ED;">
    <strong>Reason:</strong><br>${escapeHtml(row.review_note)}
  </p>`
    : "";
  const html =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#111;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">Your tournament payment needs another look</h1>
  <p>We weren't able to verify the payment claim you submitted for your tournament.</p>
  ${reasonHtml}
  <p>You can submit a new payment for the same tournament — nothing else about your tournament has changed.</p>
  <p style="margin:24px 0;">
    <a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#0B3D91;border-radius:6px;color:#ffffff;text-decoration:none;font-weight:bold;">Submit a new payment</a>
  </p>
  <p style="color:#666;font-size:12px;">If the button doesn't work, paste this into your browser:<br>${safeLink}</p>
  <p style="color:#666;font-size:12px;margin-top:32px;">Prize-Manager.com</p>
  </body></html>`;
  const text = [
    "Your tournament payment needs another look",
    "",
    "We weren't able to verify the payment claim you submitted for your tournament.",
    ...(row.review_note ? ["", `Reason: ${row.review_note}`] : []),
    "",
    "You can submit a new payment for the same tournament — nothing else about your tournament has changed.",
    "",
    "Submit a new payment:",
    `  ${link}`,
    "",
    "Prize-Manager.com",
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
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const WELCOME_EMAIL_FROM = Deno.env.get("WELCOME_EMAIL_FROM");
  const WELCOME_EMAIL_REPLY_TO = Deno.env.get("WELCOME_EMAIL_REPLY_TO");
  const APP_BASE_URL = Deno.env.get("APP_BASE_URL");
  const PAYMENT_NOTIFY_SECRET = Deno.env.get("PAYMENT_NOTIFY_SECRET");

  // A missing secret must never fall through to an open endpoint.
  if (!PAYMENT_NOTIFY_SECRET) {
    return json(500, { ok: false, reason: "server_misconfigured" });
  }
  const presented = req.headers.get("x-notify-secret") ?? "";
  if (!(await secretMatches(presented, PAYMENT_NOTIFY_SECRET))) {
    return json(401, { ok: false, reason: "unauthorized" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, { ok: false, reason: "server_misconfigured" });
  }
  if (!RESEND_API_KEY || !WELCOME_EMAIL_FROM || !APP_BASE_URL) {
    return json(500, { ok: false, reason: "email_provider_unconfigured" });
  }

  // Service-role only — there is no calling user.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: loadErr } = await admin
    .from("payment_notification_outbox")
    .select(
      "id, payment_id, tournament_id, action, recipient_email, review_note, return_to, attempts",
    )
    .in("email_status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("email_enqueued_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (loadErr) {
    console.warn("[send-payment-notifications] load_failed", {
      code: loadErr.code,
    });
    return json(500, { ok: false, reason: "load_failed" });
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    processed++;

    // 1. No address to send to — terminal, never attempted.
    if (!row.recipient_email) {
      await admin
        .from("payment_notification_outbox")
        .update({ email_status: "skipped", email_error: "missing_recipient" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // 1b. Unrenderable action — terminal, and checked BEFORE the claim so it
    //     never burns an attempt or parks the row in 'sending'.
    const email = buildEmail(row, APP_BASE_URL);
    if (!email) {
      await admin
        .from("payment_notification_outbox")
        .update({ email_status: "skipped", email_error: "unknown_action" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // 2. Claim the row. The status predicate is the lock: if another worker got
    //    here first the update matches nothing and we leave the row alone.
    const { data: claimed, error: claimErr } = await admin
      .from("payment_notification_outbox")
      .update({
        email_status: "sending",
        attempts: row.attempts + 1,
        email_error: null,
      })
      .eq("id", row.id)
      .in("email_status", ["pending", "failed"])
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      processed--;
      continue;
    }

    // 3. Send. Built above, before the claim.
    const payload: Record<string, unknown> = {
      from: WELCOME_EMAIL_FROM,
      to: [row.recipient_email],
      subject: email.subject,
      html: email.html,
      text: email.text,
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
        const summary = `resend_${resp.status}: ${respText}`.slice(0, 400);
        await admin
          .from("payment_notification_outbox")
          .update({ email_status: "failed", email_error: summary })
          .eq("id", row.id);
        console.warn("[send-payment-notifications] provider_failed", {
          id: row.id,
          status: resp.status,
        });
        failed++;
        continue;
      }
      await admin
        .from("payment_notification_outbox")
        .update({
          email_status: "sent",
          email_sent_at: new Date().toISOString(),
          email_error: null,
        })
        .eq("id", row.id);
      sent++;
    } catch (err) {
      const summary = err instanceof Error ? err.message : "unknown_error";
      await admin
        .from("payment_notification_outbox")
        .update({ email_status: "failed", email_error: summary.slice(0, 400) })
        .eq("id", row.id);
      console.warn("[send-payment-notifications] send_threw", { id: row.id });
      failed++;
    }
  }

  return json(200, { ok: true, processed, sent, failed, skipped });
});
