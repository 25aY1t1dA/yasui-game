import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Proteksi CSRF Dasar untuk Endpoint Internal API yang Bermutasi
    if (pathname.startsWith("/api/")) {
        const isMutatingMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
        const isExternalWebhook = pathname.includes("/payment/duitku-callback");

        if (isMutatingMethod && !isExternalWebhook) {
            const origin = request.headers.get("origin");
            const host = request.headers.get("host");

            if (origin && host) {
                try {
                    const originHost = new URL(origin).host;
                    if (originHost !== host) {
                        return new Response(JSON.stringify({
                            success: false,
                            error: "Forbidden: Permintaan lintas asal (Cross-Site Request) ditolak."
                        }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                } catch (e) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Forbidden: Header Origin tidak valid."
                    }), {
                        status: 403,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }
        }
    }

    // 2. Lanjutkan eksekusi ke handler berikutnya
    const response = await next();

    // 3. Pasang HTTP Security Headers Standar
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("X-XSS-Protection", "1; mode=block");

    // 4. Header Anti-Cache Khusus Endpoint API
    if (pathname.startsWith("/api/")) {
        // Jangan timpa jika endpoint sudah menentukan cache publik khusus (seperti search-categories)
        if (!response.headers.has("Cache-Control")) {
            response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        }
        response.headers.set("Pragma", "no-cache");
    }

    return response;
});
