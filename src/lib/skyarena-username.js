/**
 * HIVE USERNAME AVAILABILITY CHECKER
 *
 * Tujuan: cek apakah Hive ID yang diminta pembeli masih tersedia.
 * Mekanisme (ide owner): kirim perintah ke fitur "Lupa Password" Hive Com2uS;
 *   jika respons "ID not found / ID tidak ditemukan" => username TERSEDIA.
 *
 * STATUS: endpoint Hive forgot-password TIDAK terekspos sebagai web publik
 * (hanya ada di game client / aplikasi internal Com2uS). Perlu reverse-engineering
 * terpisah (Playwright / intercept traffic game). Karena itu modul ini dibuat
 * sebagai antarmuka + strategi fallback, siap diisi implementasi begitu endpoint
 * ditemukan.
 */

import { validateHiveUsername } from "./skyarena-fulfill.js";

/**
 * Cek availability username.
 * @returns {Promise<{available:boolean|null, reason:string, source:string}>}
 *   available: true=tersedia, false=sudah dipakai, null=belum bisa ditentukan
 */
export async function checkUsernameAvailability(username) {
    // 1. validasi format dulu (hemat request)
    const v = validateHiveUsername(username);
    if (!v.ok) return { available: false, reason: v.reason, source: "format" };

    // 2. implementasi cek ke Hive belum tersedia -> kembalikan null (unknown)
    //    frontend menampilkan "belum dapat diverifikasi, lanjut dengan risiko"
    //    dan backend fulfillment akan gagal di langkah submit bila ternyata dipakai.
    return {
        available: null,
        reason: "Cek availability Hive belum aktif (endpoint forgot-password masih riset). Username lolos validasi format.",
        source: "unimplemented",
    };
}

/**
 * PLACEHOLDER implementasi nyata via HTTP (isi setelah endpoint ditemukan).
 * Simpan di sini agar mudah diaktifkan.
 */
export async function checkUsernameViaHiveEndpoint(username, { endpoint, buildBody, parseAvailable } = {}) {
    if (!endpoint) throw new Error("endpoint Hive belum dikonfigurasi");
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody ? buildBody(username) : { id: username }),
    });
    const data = await res.json().catch(() => ({}));
    return { available: parseAvailable(data, res), raw: data, source: "hive" };
}
