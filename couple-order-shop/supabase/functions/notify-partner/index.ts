import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { orderId } = await request.json();
    const { data: order, error } = await admin.from("orders").select("*").eq("id", orderId).single();
    if (error || !order) return new Response("Order not found", { status: 404, headers: corsHeaders });
    const { data: membership } = await admin.from("profiles").select("couple_id").eq("user_id", userData.user.id).eq("couple_id", order.couple_id).single();
    if (!membership) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const { data: subscriptions } = await admin.from("push_subscriptions").select("*").eq("couple_id", order.couple_id).neq("user_id", userData.user.id);
    webpush.setVapidDetails(
      "mailto:couple-shop@example.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    const payload = JSON.stringify({ title: "点单小铺收到新订单", body: `💕 ${order.from_name} 点了「${order.item_name}」`, orderId: order.id });
    await Promise.allSettled((subscriptions ?? []).map((subscription) => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload)));
    return new Response(JSON.stringify({ sent: subscriptions?.length ?? 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
