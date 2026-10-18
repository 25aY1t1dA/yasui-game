export const normalizeSearch = (value = "") => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function distance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const next = [i];
        for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        row = next;
    }
    return row[b.length];
}

// All query words must match; short words require exact/prefix matches.
export function searchScore(text, query) {
    const name = normalizeSearch(text);
    const needle = normalizeSearch(query).slice(0, 120);
    if (!needle) return 0;
    if (name === needle) return 100;
    if (name.startsWith(needle)) return 90;
    if (name.includes(needle)) return 80;
    const words = name.split(" ");
    let score = 0;
    for (const term of needle.split(" ")) {
        const match = Math.max(0, ...words.map((word) => word === term ? 70 : word.startsWith(term) ? 60 : term.length >= 4 && Math.abs(word.length - term.length) <= 2 && distance(word, term) <= (term.length >= 7 ? 2 : 1) ? 40 : 0));
        if (!match) return 0;
        score += match;
    }
    return score / needle.split(" ").length;
}
