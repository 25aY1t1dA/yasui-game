export const IDR_TO_USD_RATE = 16000;
export const USD_RATE = IDR_TO_USD_RATE;

export function parsePrice(priceStr) {
    if (!priceStr) return 0;
    
    // Convert to string just in case
    let str = String(priceStr).trim();
    
    // Safety: if it's already a number or string representing a simple integer, handle it.
    if (/^\d+$/.test(str)) {
        return parseInt(str, 10);
    }

    // Common pattern: localized string from WooCommerce
    // Case 1: "Rp 49.500,00" (Indonesian locale) -> Remove ",00"
    // Case 2: "Rp 49,500.00" (US locale with IDR symbol) -> Remove ".00"
    // Case 3: "49500.00" (Database format) -> Remove ".00"
    if (str.match(/[,.]00$/)) {
        str = str.substring(0, str.length - 3);
    }
    
    // Now replace all non-digits
    const clean = str.replace(/\D/g, "");
    
    return parseInt(clean, 10) || 0;
}

export function formatRupiah(amount) {
    const num = typeof amount === "number" ? amount : parsePrice(amount);
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

export function formatUSD(amount) {
    const num = typeof amount === "number" ? amount : parsePrice(amount);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

export function formatPrice(amountIdr, curr = "IDR") {
    const num = typeof amountIdr === "number" ? amountIdr : parsePrice(amountIdr);
    if (curr === "USD") {
        return formatUSD(num / USD_RATE);
    }
    return formatRupiah(num);
}

