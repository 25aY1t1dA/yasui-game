/**
 * Media Image Proxy - Yasui Game
 * Proteksi SSRF, Whitelist Domain Backend, Isolasi Kredensial & Validasi MIME Image
 */
import { Buffer } from "node:buffer";

// Private IPv4 & loopback regex untuk proteksi SSRF
const PRIVATE_IP_REGEX = /^(?:127\.|10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|0\.|localhost|::1)/i;

export async function GET({ request }) {
    const url = new URL(request.url);
    const src = url.searchParams.get("src");

    if (!src) {
        return new Response("Missing 'src' query parameter.", { status: 400 });
    }

    let targetUrl;
    try {
        targetUrl = new URL(src);
    } catch {
        return new Response("Invalid image URL provided.", { status: 400 });
    }

    // 1. Validasi Protocol (Hanya HTTP/HTTPS)
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
        return new Response("Forbidden protocol.", { status: 403 });
    }

    // 2. Proteksi SSRF: Blokir Localhost dan Private Network
    const hostname = targetUrl.hostname.toLowerCase();
    if (PRIVATE_IP_REGEX.test(hostname) || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
        return new Response("Access to internal network is prohibited.", { status: 403 });
    }

    // 3. Domain Whitelist: Hanya izinkan domain backend resmi WordPress
    const wpUrlEnv = import.meta.env.WP_URL || "https://admin.yasuigame.com";
    let officialWpHost = "admin.yasuigame.com";
    try {
        officialWpHost = new URL(wpUrlEnv).hostname.toLowerCase();
    } catch (e) {
        officialWpHost = "admin.yasuigame.com";
    }

    const isAllowedHost = 
        hostname === officialWpHost || 
        hostname === "admin.yasuigame.com" || 
        hostname.endsWith(".yasuigame.com") ||
        hostname.includes("wp.com") ||
        hostname.includes("gravatar.com");

    if (!isAllowedHost) {
        return new Response("Unauthorized image domain.", { status: 403 });
    }

    try {
        const fetchHeaders = {
            "User-Agent": "Yasui-ImageProxy/2.0"
        };

        // 4. Kredensial Basic Auth HANYA dikirim jika target strictly domain backend WordPress kita
        const isOfficialWp = hostname === officialWpHost || hostname === "admin.yasuigame.com";
        const wpUser = import.meta.env.WP_APP_USER || import.meta.env.WP_USER;
        const wpPass = import.meta.env.WP_APP_PASSWORD || import.meta.env.WP_PASS;

        if (isOfficialWp && wpUser && wpPass) {
            fetchHeaders["Authorization"] = "Basic " + Buffer.from(`${wpUser}:${wpPass}`).toString("base64");
        }

        const response = await fetch(targetUrl.toString(), {
            headers: fetchHeaders,
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            return new Response("Failed to fetch image from upstream.", { status: response.status });
        }

        const contentType = response.headers.get("Content-Type") || "image/jpeg";

        // 5. Validasi tipe MIME: hanya izinkan format gambar
        if (!contentType.toLowerCase().startsWith("image/")) {
            return new Response("Upstream resource is not a valid image.", { status: 415 });
        }

        return new Response(response.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; img-src 'self'"
            }
        });

    } catch (e) {
        if (e.name === "TimeoutError") {
            return new Response("Upstream image gateway timeout.", { status: 504 });
        }
        return new Response("Internal image proxy error.", { status: 500 });
    }
}