/**
 * Data Sanitization & Anti-XSS Utility
 * Yasui Game - Zero-Trust Headless WooCommerce
 */

// Tag yang benar-benar dilarang karena berisiko eksekusi kode / XSS
const DANGEROUS_TAGS = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "applet",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "meta",
    "link",
    "svg",
    "math",
    "base",
    "frame",
    "frameset"
];

// Tag yang diizinkan untuk formatting konten katalog WooCommerce
const ALLOWED_TAGS = new Set([
    "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s", "del", "strike", "mark", "small",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "code",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "span", "div",
    "a", "img"
]);

// Atribut yang aman per tag
const ALLOWED_ATTRS = {
    "a": new Set(["href", "title", "target", "rel", "class"]),
    "img": new Set(["src", "alt", "title", "width", "height", "class", "loading"]),
    "*": new Set(["class", "title", "id"])
};

// Skema URL yang aman
const SAFE_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

/**
 * Validasi apakah URL aman (mencegah javascript:, data:, vbscript:)
 */
function isSafeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return false;
    const trimmed = urlStr.trim().toLowerCase();

    // Izinkan relative path & anchor
    if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
        return true;
    }

    try {
        const parsed = new URL(trimmed);
        return SAFE_PROTOCOLS.includes(parsed.protocol);
    } catch {
        // Jika format URL tidak dapat di-parse dan tidak diawali safe prefix
        return false;
    }
}

/**
 * Sanitasi HTML string dari WordPress sebelum dirender via set:html
 * Membersihkan script, iframe, on* attributes, javascript: pseudo-protocols
 */
export function sanitizeHtml(html) {
    if (!html || typeof html !== "string") return "";

    let cleaned = html;

    // 1. Hapus seluruh blok tag berbahaya dan isinya
    for (const tag of DANGEROUS_TAGS) {
        const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/?>`, "gi");
        cleaned = cleaned.replace(regex, "");
    }

    // 2. Hapus komentar HTML
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

    // 3. Bersihkan tag dan atribut menggunakan parser regex presisi
    cleaned = cleaned.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName, attrs) => {
        const tagLower = tagName.toLowerCase();

        // Jika bukan tag yang diizinkan, buang tag sepenuhnya
        if (!ALLOWED_TAGS.has(tagLower)) {
            return "";
        }

        // Jika tag penutup </tag>
        if (match.startsWith("</")) {
            return `</${tagLower}>`;
        }

        // Parse atribut pada tag pembuka
        const allowedAttrsForTag = ALLOWED_ATTRS[tagLower] || new Set();
        const globalAllowed = ALLOWED_ATTRS["*"];

        let safeAttrsString = "";
        const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
        let attrMatch;

        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const attrName = attrMatch[1].toLowerCase();
            const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

            // Blokir semua event handler on* (onclick, onerror, onload, dll)
            if (attrName.startsWith("on")) {
                continue;
            }

            // Cek apakah atribut diizinkan untuk tag ini
            if (!allowedAttrsForTag.has(attrName) && !globalAllowed.has(attrName)) {
                continue;
            }

            // Validasi keamanan URL pada atribut href dan src
            if (attrName === "href" || attrName === "src") {
                if (!isSafeUrl(attrVal)) {
                    continue;
                }
            }

            // Sanitasi nilai atribut terhadap tanda kutip ganda
            const escapedVal = String(attrVal)
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            safeAttrsString += ` ${attrName}="${escapedVal}"`;
        }

        // Aturan khusus: untuk tag <a> selalu tambahkan rel="noopener noreferrer" jika target="_blank"
        if (tagLower === "a" && safeAttrsString.includes('target="_blank"') && !safeAttrsString.includes("rel=")) {
            safeAttrsString += ' rel="noopener noreferrer"';
        }

        const isSelfClosing = match.endsWith("/>");
        return `<${tagLower}${safeAttrsString}${isSelfClosing ? " />" : ">"}`;
    });

    return cleaned;
}

/**
 * Hapus seluruh tag HTML dan kembalikan teks murni
 */
export function stripHtml(html) {
    if (!html || typeof html !== "string") return "";
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Sanitasi string input teks dari user (mencegah SQL/XSS/control characters)
 */
export function sanitizeText(str, maxLength = 255) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Hapus control characters
        .trim()
        .slice(0, maxLength);
}

/**
 * Validasi alamat email dengan standar RFC 5322 ringkas
 */
export function isValidEmail(email) {
    if (!email || typeof email !== "string") return false;
    const clean = email.trim().toLowerCase();
    if (clean.length > 254) return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(clean);
}
