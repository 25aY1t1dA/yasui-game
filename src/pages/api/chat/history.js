import { getOrCreateChatSession, getChatMessages } from "../../../lib/supabase.server.js";
import { sanitizeText } from "../../../lib/sanitize.js";

export const prerender = false;

function sanitizeVisitorToken(token) {
    if (!token || typeof token !== "string") return "";
    return token.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64);
}

export const GET = async ({ url, clientAddress }) => {
    try {
        const rawToken = url.searchParams.get("visitor_token");
        const baseToken = sanitizeVisitorToken(rawToken);

        if (!baseToken) {
            return new Response(JSON.stringify({
                success: false,
                error: "Parameter visitor_token wajib disertakan."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Dukungan Contextual Threading: Pisahkan sesi jika membaca riwayat pesanan (order dispute)
        const rawOrderId = url.searchParams.get("order_id") || url.searchParams.get("context_order_id");
        const cleanOrderId = rawOrderId ? sanitizeText(String(rawOrderId), 50).replace(/[^a-zA-Z0-9_\-]/g, "") : null;
        const effectiveToken = cleanOrderId ? `${baseToken}__order_${cleanOrderId}` : baseToken;

        const lang = url.searchParams.get("lang") === "en" ? "en" : "id";
        const metadata = {
            lang,
            contextOrderId: cleanOrderId,
            threadType: cleanOrderId ? "order" : "general"
        };

        const sessionResult = await getOrCreateChatSession(effectiveToken, metadata);

        if (!sessionResult?.success || !sessionResult?.session) {
            return new Response(JSON.stringify({
                success: false,
                error: "Gagal memuat sesi chat."
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const session = sessionResult.session;
        const messages = await getChatMessages(session.id, 50);

        return new Response(JSON.stringify({
            success: true,
            session: {
                id: session.id,
                mode: session.mode,
                status: session.status,
                lang: session.lang,
                context_order_id: session.context_order_id,
                context_product: session.context_product
            },
            messages: messages.map(m => ({
                id: m.id,
                sender_role: m.sender_role,
                message: m.message,
                created_at: m.created_at
            }))
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, max-age=0"
            }
        });

    } catch (err) {
        console.error("[Chat History API GET Error]:", err.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Terjadi kesalahan internal server."
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

export const POST = async ({ request, clientAddress }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const rawToken = body?.visitor_token;
        const baseToken = sanitizeVisitorToken(rawToken);

        if (!baseToken) {
            return new Response(JSON.stringify({
                success: false,
                error: "Field visitor_token wajib disertakan."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Dukungan Contextual Threading: Pisahkan sesi jika membuat/update thread pesanan
        const rawOrderId = body?.order_id || body?.context_order_id;
        const cleanOrderId = rawOrderId ? sanitizeText(String(rawOrderId), 50).replace(/[^a-zA-Z0-9_\-]/g, "") : null;
        const effectiveToken = cleanOrderId ? `${baseToken}__order_${cleanOrderId}` : baseToken;

        const customerEmail = body?.customer_email || body?.email ? sanitizeText(body.customer_email || body.email, 120) : null;

        const metadata = {
            buyerName: sanitizeText(body?.name || "", 60),
            buyerEmail: customerEmail,
            buyerPhone: sanitizeText(body?.phone || "", 30),
            contextProduct: sanitizeText(body?.context_product || "", 100),
            contextOrderId: cleanOrderId,
            threadType: cleanOrderId ? "order" : "general",
            lang: body?.lang === "en" ? "en" : "id"
        };

        const sessionResult = await getOrCreateChatSession(effectiveToken, metadata);

        if (!sessionResult?.success || !sessionResult?.session) {
            return new Response(JSON.stringify({
                success: false,
                error: "Gagal membuat atau memperbarui sesi chat."
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const session = sessionResult.session;
        const messages = await getChatMessages(session.id, 50);

        return new Response(JSON.stringify({
            success: true,
            session: {
                id: session.id,
                mode: session.mode,
                status: session.status,
                lang: session.lang,
                context_order_id: session.context_order_id,
                context_product: session.context_product
            },
            messages: messages.map(m => ({
                id: m.id,
                sender_role: m.sender_role,
                message: m.message,
                created_at: m.created_at
            }))
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, max-age=0"
            }
        });

    } catch (err) {
        console.error("[Chat History API POST Error]:", err.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Terjadi kesalahan internal server."
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
