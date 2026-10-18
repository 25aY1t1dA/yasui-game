/**
 * GET /api/sw/set-account/status?orderId=...&email=...
 * Polling status fulfillment Set Account Hive ID.
 * Auth: Bearer session token (sama dengan pola /api/user/orders).
 */
import { wcFetch, verifySessionToken } from "../../../../lib/wc.js";

export const GET = async ({ request, url }) => {
    try {
        const orderId = parseInt(url.searchParams.get("orderId") || "", 10);
        const email = (url.searchParams.get("email") || "").trim().toLowerCase();
        if (!orderId || !email) {
            return json(400, { success: false, error: "orderId & email wajib." });
        }

        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("token");
        if (!token || !verifySessionToken(token, email)) {
            return json(401, { success: false, error: "Sesi tidak valid." });
        }

        const order = await wcFetch(`orders/${orderId}`, { params: { context: "edit" } });
        if (!order || !order.id) return json(404, { success: false, error: "Order tidak ditemukan." });
        if ((order.billing?.email || "").toLowerCase() !== email) {
            return json(403, { success: false, error: "Order bukan milik Anda." });
        }

        const meta = (order.meta_data || []).find((m) => m.key === "_sw_set_account")?.value || null;
        return json(200, {
            success: true,
            orderId,
            hasSwProducts: (order.line_items || []).some((i) => (i.sku || "").startsWith("sw-")),
            fulfillment: meta ? {
                status: meta.status || "processing",
                lastStatus: meta.lastStatus || null,
                error: meta.error || null,
                submittedAt: meta.submittedAt || null,
                completedAt: meta.completedAt || null,
            } : { status: "awaiting_form" },
        });
    } catch (error) {
        console.error("SW status error:", error);
        return json(500, { success: false, error: "Kesalahan server." });
    }
};

function json(status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
