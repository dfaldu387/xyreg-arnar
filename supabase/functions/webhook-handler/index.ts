import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WEBHOOK-HANDLER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      throw new Error("No Stripe signature found");
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    logStep("Event type", { type: event.type });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        logStep('Processing checkout completed event');
        const session = event.data.object as Stripe.CheckoutSession;

        // Get the subscription from the session
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

        if (!subscriptionId) {
          logStep('No subscription found in session');
          break;
        }

        const fullSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const productId = fullSubscription.items.data[0]?.price.product as string;
        const priceId = fullSubscription.items.data[0]?.price.id as string;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

        // Get user email from multiple possible sources
        let userEmail = session.customer_email;

        // If no customer_email, try to get from metadata
        if (!userEmail && session.metadata?.user_email) {
          userEmail = session.metadata.user_email;
        }

        // If still no email, fetch from Stripe customer
        if (!userEmail && customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && !customer.deleted && customer.email) {
            userEmail = customer.email;
          }
        }

        logStep('Checkout details', {
          subscriptionId,
          productId,
          priceId,
          customerId,
          userEmail
        });

        if (!userEmail) {
          logStep('No email found for customer');
          break;
        }

        // Find user by email
        const { data: userProfile, error: userError } = await supabaseClient
          .from('user_profiles')
          .select('id')
          .eq('email', userEmail)
          .single();

        if (userError || !userProfile) {
          logStep('User not found', { email: userEmail, error: userError });
          break;
        }

        // Get plan name from subscription_plans table using price_id
        let planName = 'Unknown';
        let planTier = 'Unknown';
        const { data: planData } = await supabaseClient
          .from('subscription_plans')
          .select('name')
          .eq('stripe_price_id', priceId)
          .single();

        if (planData) {
          planName = planData.name;
          planTier = planData.name;
        }
        logStep('Plan details', { planName, planTier, priceId });

        // Save checkout session to stripe_checkout_sessions table
        const checkoutSessionData = {
          session_id: session.id,
          user_id: userProfile.id,
          customer_id: customerId,
          subscription_id: subscriptionId,
          plan_id: priceId, // Store Stripe price ID in plan_id field
          plan_name: planName,
          price_amount: session.amount_total || 0,
          price_currency: session.currency || 'usd',
          payment_status: session.payment_status,
          metadata: {
            stripe_price_id: priceId,
            stripe_product_id: productId,
            tier: planTier,
            user_email: userEmail,
          },
        };

        const { error: checkoutError } = await supabaseClient
          .from('stripe_checkout_sessions')
          .insert(checkoutSessionData);

        if (checkoutError) {
          logStep('Error saving checkout session', { error: checkoutError });
        } else {
          logStep('Checkout session saved successfully', { sessionId: session.id });
        }

        // Upsert subscription record
        const subscriptionData: any = {
          user_id: userProfile.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          product_id: productId,
          price_id: priceId,
          status: fullSubscription.status,
          cancel_at_period_end: false,
        };

        // Add dates safely
        if (fullSubscription.current_period_start) {
          subscriptionData.current_period_start = new Date(fullSubscription.current_period_start * 1000).toISOString();
        }
        if (fullSubscription.current_period_end) {
          subscriptionData.current_period_end = new Date(fullSubscription.current_period_end * 1000).toISOString();
        }
        if (fullSubscription.trial_start) {
          subscriptionData.trial_start = new Date(fullSubscription.trial_start * 1000).toISOString();
        }
        if (fullSubscription.trial_end) {
          subscriptionData.trial_end = new Date(fullSubscription.trial_end * 1000).toISOString();
        }

        const { error: subError } = await supabaseClient
          .from('user_subscriptions')
          .upsert(subscriptionData, {
            onConflict: 'user_id'
          });

        if (subError) {
          logStep('Error creating subscription record', { error: subError });
        } else {
          logStep('Subscription record created successfully', { userId: userProfile.id });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: existingSub } = await supabaseClient
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (existingSub) {
          const updateData: any = {
            stripe_subscription_id: subscription.id,
            product_id: subscription.items.data[0].price.product as string,
            price_id: subscription.items.data[0].price.id,
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          };

          // Add dates safely
          if (subscription.current_period_start) {
            updateData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
          }
          if (subscription.current_period_end) {
            updateData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
          }
          if (subscription.trial_end) {
            updateData.trial_end = new Date(subscription.trial_end * 1000).toISOString();
          }

          await supabaseClient
            .from('user_subscriptions')
            .update(updateData)
            .eq('user_id', existingSub.user_id);

          logStep("Subscription updated", { userId: existingSub.user_id });

          // ── Sync expires_at in new_pricing_company_plans ──
          // When Stripe renews, update the company plan's expires_at with the new period end
          const companyId = subscription.metadata?.company_id || subscription.metadata?.companyId;
          if (companyId && subscription.current_period_end) {
            const newExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
            const newStatus = subscription.cancel_at_period_end ? 'cancelled' :
                             (subscription.status === 'active' ? 'active' :
                              subscription.status === 'trialing' ? 'trial' : subscription.status);

            const { error: pricingError } = await supabaseClient
              .from('new_pricing_company_plans')
              .update({
                expires_at: newExpiresAt,
                status: newStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('company_id', companyId);

            if (pricingError) {
              logStep("Error updating new_pricing_company_plans", { error: pricingError });
            } else {
              logStep("Synced expires_at in new_pricing_company_plans", {
                companyId,
                expiresAt: newExpiresAt,
                status: newStatus,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              });
            }
          } else if (!companyId) {
            // Fallback: try to find company_id from user's company access
            const { data: userCompany } = await supabaseClient
              .from('user_company_access')
              .select('company_id')
              .eq('user_id', existingSub.user_id)
              .eq('is_primary', true)
              .single();

            if (userCompany?.company_id && subscription.current_period_end) {
              const newExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
              const newStatus = subscription.cancel_at_period_end ? 'cancelled' :
                               (subscription.status === 'active' ? 'active' :
                                subscription.status === 'trialing' ? 'trial' : subscription.status);

              await supabaseClient
                .from('new_pricing_company_plans')
                .update({
                  expires_at: newExpiresAt,
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('company_id', userCompany.company_id);

              logStep("Synced expires_at via user lookup", {
                companyId: userCompany.company_id,
                expiresAt: newExpiresAt,
              });
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: existingSub } = await supabaseClient
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (existingSub) {
          await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', existingSub.user_id);

          // ── Mark company plan as cancelled so menus lock after expires_at ──
          const companyId = subscription.metadata?.company_id || subscription.metadata?.companyId;
          const targetCompanyId = companyId || await (async () => {
            const { data } = await supabaseClient
              .from('user_company_access')
              .select('company_id')
              .eq('user_id', existingSub.user_id)
              .eq('is_primary', true)
              .single();
            return data?.company_id;
          })();

          if (targetCompanyId) {
            await supabaseClient
              .from('new_pricing_company_plans')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('company_id', targetCompanyId);

            logStep("Company plan marked cancelled", { companyId: targetCompanyId });
          }

          logStep("Subscription canceled", { userId: existingSub.user_id });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubscriptionId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id;

        logStep("Payment succeeded", { invoiceId: invoice.id, subscriptionId: invoiceSubscriptionId });

        // When Stripe charges a renewal, update expires_at in new_pricing_company_plans
        if (invoiceSubscriptionId) {
          const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
          if (stripeKey) {
            const stripeClient = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
            const fullSub = await stripeClient.subscriptions.retrieve(invoiceSubscriptionId);

            // Find the user
            const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
            const { data: userSub } = await supabaseClient
              .from('user_subscriptions')
              .select('user_id')
              .eq('stripe_customer_id', customerId)
              .single();

            if (userSub && fullSub.current_period_end) {
              const newExpiresAt = new Date(fullSub.current_period_end * 1000).toISOString();

              // Find company_id from metadata or user lookup
              let targetCompanyId = fullSub.metadata?.company_id || fullSub.metadata?.companyId;
              if (!targetCompanyId) {
                const { data: uc } = await supabaseClient
                  .from('user_company_access')
                  .select('company_id')
                  .eq('user_id', userSub.user_id)
                  .eq('is_primary', true)
                  .single();
                targetCompanyId = uc?.company_id;
              }

              if (targetCompanyId) {
                await supabaseClient
                  .from('new_pricing_company_plans')
                  .update({
                    expires_at: newExpiresAt,
                    status: 'active',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('company_id', targetCompanyId);

                logStep("Renewed expires_at on payment success", {
                  companyId: targetCompanyId,
                  newExpiresAt,
                });
              }
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Payment failed", { invoiceId: invoice.id });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
