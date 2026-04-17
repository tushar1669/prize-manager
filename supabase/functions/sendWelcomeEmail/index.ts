import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_NAME = "sendWelcomeEmail";
const MAX_BATCH = 20;
const MAX_ATTEMPTS = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WelcomeJob = {
  id: string;
  email: string;
  coupon_code: string;
  coupon_expires_at: string;
  attempts: number;
};

const formatExpiryDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
};

const buildEmailContent = (couponCode: string, couponExpiry: string) => {
  const expiry = formatExpiryDate(couponExpiry);

  const subject = "Welcome to Prize Manager — Your 100% Coupon Inside";
  const text = `Welcome to Prize Manager!\n\nYour welcome coupon code: ${couponCode}\nExpires on: ${expiry}\nValid for one tournament above 150 players.\n\nHow to redeem:\n1) Open your tournament and go to upgrade/payment.\n2) Apply coupon code ${couponCode}.\n3) Complete upgrade (eligible only when your tournament has more than 150 players).\n\nWhy organizers use Prize Manager:\n1. Create Prizes in less than 2 mins.\n2. Publish online for your tournament participants to check the ranks rather than printing and pasting. SAVE paper and Hassle.\n3. Free for 150 player tournaments with any number of categories.\n\nContact\nTushar Saraswat\nSNA and NI, General Secretary of Varanasi Chess Association.\nEmail: chess.tushar@gmail.com\nPhone/WhatsApp: +91-9559161414\n\nAbout\nI am a software engineer working with TechM and a chess player since childhood, won many championships and lately player the FIDE Corporate WORLD CHampionship in GOA along with the FIDE WOrld Cup. Serving as the current General Secretary of Varanasi Chess Association and an SNA and NI. Fide Id: 25022288\n\nCoupon policy: 1 free coupon to be used in your tournaments above 150 players.`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2>Welcome to Prize Manager!</h2>
      <p>Thanks for signing up. Your onboarding benefit is ready.</p>
      <p><strong>Your welcome coupon:</strong> <code>${couponCode}</code><br/>
      <strong>Expires on:</strong> ${expiry}<br/>
      <strong>Validity:</strong> valid for one tournament above 150 players.</p>

      <h3>How to redeem</h3>
      <ol>
        <li>Open your tournament and go to upgrade/payment.</li>
        <li>Apply coupon code <code>${couponCode}</code>.</li>
        <li>Complete upgrade (eligible only when tournament player count is greater than 150).</li>
      </ol>

      <h3>Why organizers use Prize Manager</h3>
      <ul>
        <li>Create Prizes in less than 2 mins.</li>
        <li>Publish online for your tournament participants to check the ranks rather than printing and pasting. SAVE paper and Hassle.</li>
        <li>Free for 150 player tournaments with any number of categories.</li>
      </ul>

      <h3>Contact</h3>
      <p><strong>Tushar Saraswat</strong><br/>
      SNA and NI, General Secretary of Varanasi Chess Association.<br/>
      Email: <a href="mailto:chess.tushar@gmail.com">chess.tushar@gmail.com</a><br/>
      Phone / WhatsApp: <a href="tel:+919559161414">+91-9559161414</a></p>

      <h3>About me</h3>
      <p>I am a software engineer working with TechM and a chess player since childhood, won many championships and lately player the FIDE Corporate WORLD CHampionship in GOA along with the FIDE WOrld Cup.
      Serving as the current General Secretary of Varanasi Chess Association and an SNA and NI.<br/>Fide Id: 25022288</p>

      <p><em>Coupon policy: 1 free coupon to be used in your tournaments above 150 players.</em></p>
    </div>
  `;

  return { subject, text, html };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const welcomeFrom = Deno.env.get("WELCOME_EMAIL_FROM");

  if (!resendApiKey || !welcomeFrom) {
    const reason = "missing_email_secrets: configure RESEND_API_KEY and WELCOME_EMAIL_FROM";

    const { data: jobsToFail } = await supabase
      .from("welcome_email_queue")
      .select("id, attempts")
      .in("status", ["pending", "failed"])
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH);

    for (const job of jobsToFail ?? []) {
      await supabase
        .from("welcome_email_queue")
        .update({
          status: "failed",
          attempts: (job.attempts ?? 0) + 1,
          last_error: reason,
        })
        .eq("id", job.id)
        .in("status", ["pending", "failed"]);
    }

    return new Response(JSON.stringify({ ok: false, reason, failedJobs: jobsToFail?.length ?? 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("welcome_email_queue")
    .select("id, email, coupon_code, coupon_expires_at, attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (jobsError) {
    return new Response(JSON.stringify({ ok: false, error: jobsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const job of (jobs ?? []) as WelcomeJob[]) {
    const { data: claimed } = await supabase
      .from("welcome_email_queue")
      .update({
        status: "processing",
        attempts: (job.attempts ?? 0) + 1,
        last_error: null,
      })
      .eq("id", job.id)
      .in("status", ["pending", "failed"])
      .is("sent_at", null)
      .select("id, email, coupon_code, coupon_expires_at")
      .maybeSingle();

    if (!claimed) continue;

    try {
      const { subject, text, html } = buildEmailContent(claimed.coupon_code, claimed.coupon_expires_at);

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `welcome-email-${job.id}`,
        },
        body: JSON.stringify({
          from: welcomeFrom,
          to: [claimed.email],
          subject,
          html,
          text,
        }),
      });

      if (!resendResponse.ok) {
        const body = await resendResponse.text();
        throw new Error(`resend_http_${resendResponse.status}: ${body.slice(0, 500)}`);
      }

      await supabase
        .from("welcome_email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", job.id)
        .eq("status", "processing")
        .is("sent_at", null);

      sentCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "unknown_send_error";
      await supabase
        .from("welcome_email_queue")
        .update({ status: "failed", last_error: message })
        .eq("id", job.id)
        .eq("status", "processing");

      failedCount += 1;
      console.error(`[${FUNCTION_NAME}] failed job`, { jobId: job.id, error: message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, attempted: jobs?.length ?? 0, sent: sentCount, failed: failedCount }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
