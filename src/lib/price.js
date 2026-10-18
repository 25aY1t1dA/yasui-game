export function parsePrice(priceStr) {
    if (!priceStr) return 0;
    
    // Convert to string just in case
    let str = String(priceStr).trim();
    
    // Safety: if it's already a number or string representing a simple integer, handle it.
    if (/^\d+$/.test(str)) {
        return parseInt(str);
    }

    // Common pattern: localized string from WooCommerce
    // Case 1: "Rp 49.500,00" (Indonesian locale) -> Remove ",00"
    // Case 2: "Rp 49,500.00" (US locale with IDR symbol) -> Remove ".00"
    // Case 3: "49500.00" (Database format) -> Remove ".00"
    
    // Strategy: 
    // If string ends with ",00", replace with empty.
    // If string ends with ".00", replace with empty.
    // Also handle ",00" where 00 are digits. 
    // Ideally we want to prevent merging cents.
    
    // If we have a comma or dot followed by exactly two zeros at the end, strip them.
    if (str.match(/[,.]00$/)) {
        str = str.substring(0, str.length - 3);
    }
    
    // Now replace all non-digits
    const clean = str.replace(/\D/g, "");
    
    return parseInt(clean) || 0;
}
