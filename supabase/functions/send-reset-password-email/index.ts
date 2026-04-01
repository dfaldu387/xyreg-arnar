import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const getResetPasswordEmailHtml = (resetLink: string): string => {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 30px;">
            <h1 style="color:#ffffff;font-size:28px;font-weight:600;margin:0;line-height:1.2;">Reset Your Password</h1>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:40px 30px;">
            <h2 style="color:#1f2937;font-size:24px;font-weight:600;margin:0 0 20px 0;line-height:1.2;">Password Reset Request</h2>
            <p style="color:#374151;font-size:16px;line-height:1.6;margin:16px 0;">Hello,</p>
            <p style="color:#374151;font-size:16px;line-height:1.6;margin:16px 0;">We received a request to reset the password for your <strong>Xyreg</strong> account. Click the button below to set a new password:</p>
            <!-- Info box -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
              <tr>
                <td style="background-color:#f3f4f6;padding:12px 20px;border-radius:8px;border-left:4px solid #667eea;">
                  <p style="color:#374151;font-size:16px;margin:0;font-weight:500;">This link will expire in 24 hours for your security.</p>
                </td>
              </tr>
            </table>
            <!-- CTA Button -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
              <tr>
                <td align="center">
                  <a href="${resetLink}" target="_blank" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:8px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;text-align:center;display:inline-block;padding:16px 32px;border:none;cursor:pointer;">Reset Password</a>
                </td>
              </tr>
            </table>
            <p style="color:#374151;font-size:16px;line-height:1.6;margin:16px 0;">If the button does not work, you can copy and paste this link into your browser:</p>
            <!-- Fallback link -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:15px 0;">
              <tr>
                <td style="background-color:#f9fafb;padding:15px;border-radius:6px;border:1px solid #e5e7eb;">
                  <a href="${resetLink}" style="color:#667eea;font-size:14px;font-family:monospace;word-break:break-all;text-decoration:underline;">${resetLink}</a>
                </td>
              </tr>
            </table>
            <p style="color:#374151;font-size:16px;line-height:1.6;margin:16px 0;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 16px 0;"><strong>Stay secure!</strong></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:30px;background-color:#f9fafb;text-align:center;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;">
                  <p style="color:#6b7280;font-size:14px;margin:5px 0;"><strong>Xyreg</strong> - Your Company Management Platform</p>
                  <p style="color:#6b7280;font-size:14px;margin:5px 0;">&#169; 2025 Xyreg. All rights reserved.</p>
                  <p style="color:#9ca3af;font-size:12px;margin:10px 0 0 0;">This is an automated security email from Xyreg. You received this because a password reset was requested for your account.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Reset password email function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectUrl } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create Supabase admin client to generate recovery link
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate recovery link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectUrl || `${supabaseUrl.replace('.supabase.co', '')}/reset-password?source=email`,
      },
    });

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      // Return success even if user doesn't exist (prevents email enumeration)
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resetLink = linkData?.properties?.action_link;

    if (!resetLink) {
      console.error("No action link generated");
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend API
    const emailResponse = await resend.emails.send({
      from: "Xyreg <noreply@xyreg.com>",
      to: [email],
      subject: "Reset Your Password - Xyreg",
      html: getResetPasswordEmailHtml(resetLink),
    });

    console.log("Reset password email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in reset password email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send reset email" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
};

serve(handler);
