import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.server.js";
import { sendTelegramMessage } from "./telegram.server.js";

// Guard: Modul ini hanya boleh dijalankan di server-side context (Node.js / SSR Astro)
if (import.meta.env && import.meta.env.SSR === false) {
    throw new Error("Security Violation: crypto-payment.server module can only be imported in server-side context.");
}

/**
 * Helper pembaca environment variable yang aman dan toleran terhadap SSR / Node
 */
const getEnv = (key, fallback = "") => {
    try {
        const envPath = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, "utf-8");
            const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
            if (match && match[1]) {
                const val = match[1].trim().replace(/^["']|["']$/g, "");
                if (typeof process !== "undefined" && process.env) {
                    process.env[key] = val;
                }
                return val;
            }
        }
    } catch (e) {}
    if (typeof process !== "undefined" && process.env && process.env[key]) {
        return process.env[key];
    }
    try {
        if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
            return import.meta.env[key];
        }
    } catch (e) {}
    return fallback;
};

// ==============================================================================
// 1. KONFIGURASI DOMPET OWNER & RPC BLOCKCHAIN
// ==============================================================================
export const CRYPTO_WALLET_EVM = getEnv("CRYPTO_WALLET_EVM", "0x71C95911E9A5D330f4D621842EC243EE1343292e");
export const CRYPTO_WALLET_TRC20 = getEnv("CRYPTO_WALLET_TRC20", "TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6");

export const BSC_RPC_URLS = [
    getEnv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
    "https://bsc-dataseed1.defibit.io",
    "https://rpc.ankr.com/bsc"
];

export const POLYGON_RPC_URLS = [
    getEnv("POLYGON_RPC_URL", "https://polygon-rpc.com"),
    "https://rpc.ankr.com/polygon"
];

export const TRONGRID_API_URL = getEnv("TRONGRID_API_URL", "https://api.trongrid.io").replace(/\/+$/, "");
export const CRYPTO_USD_RATE = Number(getEnv("CRYPTO_USD_RATE", "16000")) || 16000;

// Topic 0 Event ERC-20 Transfer(address,address,uint256)
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ==============================================================================
// 2. SPESIFIKASI KANAL & SMART CONTRACT RESMI (ANTI-FAKE TOKEN)
// ==============================================================================
export const CRYPTO_CHANNELS = {
    "CRYPTO_USDT_BEP20": {
        id: "CRYPTO_USDT_BEP20",
        token: "USDT",
        network: "BSC_BEP20",
        name: "USDT • BEP-20 (BNB Smart Chain)",
        badge: "REKOMENDASI • Gas Fee ~$0.01",
        chainType: "evm",
        decimals: 18,
        // Smart Contract Resmi Tether USD di BNB Smart Chain
        contractAddress: "0x55d398326f99059fF775485246999027B3197955",
        contractDisplay: "0x55d3...7955",
        acceptedContracts: ["0x55d398326f99059ff775485246999027b3197955"],
        walletAddress: CRYPTO_WALLET_EVM,
        rpcUrls: BSC_RPC_URLS,
        explorerBase: "https://bscscan.com/tx/"
    },
    "CRYPTO_USDC_POLYGON": {
        id: "CRYPTO_USDC_POLYGON",
        token: "USDC",
        network: "POLYGON_POS",
        name: "USDC / USDT • Polygon POS",
        badge: "INSTANT • Gas Fee < $0.01",
        chainType: "evm",
        decimals: 6,
        // Smart Contract Resmi USDC Native di Polygon POS (dan menerima USDT Polygon sebagai alternatif sah)
        contractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        contractDisplay: "0x3c49...3359",
        acceptedContracts: [
            "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Native USDC
            "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Native USDT Polygon
            "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"  // Bridged USDC.e
        ],
        walletAddress: CRYPTO_WALLET_EVM,
        rpcUrls: POLYGON_RPC_URLS,
        explorerBase: "https://polygonscan.com/tx/"
    },
    "CRYPTO_USDT_TRC20": {
        id: "CRYPTO_USDT_TRC20",
        token: "USDT",
        network: "TRON_TRC20",
        name: "USDT • TRC-20 (TRON Network)",
        badge: "POPULER • TRON Network",
        chainType: "tron",
        decimals: 6,
        // Smart Contract Resmi Tether USD di TRON
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        contractHex: "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
        contractDisplay: "TR7NHq...Lj6t",
        acceptedContracts: ["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"],
        walletAddress: CRYPTO_WALLET_TRC20,
        apiUrl: TRONGRID_API_URL,
        explorerBase: "https://tronscan.org/#/transaction/"
    }
};

/**
 * Cek apakah string payment method adalah metode Crypto
 */
export function isCryptoChannel(method) {
    if (!method) return false;
    const upper = String(method).toUpperCase();
    return upper in CRYPTO_CHANNELS || upper.startsWith("CRYPTO_");
}

/**
 * Mengambil detail konfigurasi kanal crypto berdasarkan kode
 */
export function getCryptoChannelConfig(channelId) {
    const key = String(channelId || "CRYPTO_USDT_BEP20").toUpperCase();
    return CRYPTO_CHANNELS[key] || CRYPTO_CHANNELS["CRYPTO_USDT_BEP20"];
}

// ==============================================================================
// 3. KALKULASI NOMINAL PRESISI + "UNIQUE MICRO-DECIMAL FINGERPRINT"
// ==============================================================================
/**
 * Konversi IDR ke USD/USDT dengan 3 digit desimal unik di belakang koma berbasis order_id.
 * Contoh: Base $8.50 + Order #1042 -> 8.542 USDT.
 * 
 * @param {number} totalIdr - Total tagihan IDR dari WooCommerce
 * @param {number|string} orderId - ID pesanan WooCommerce
 * @param {number} customRate - Kurs konversi opsional (default: 16000)
 * @returns {object} { expectedAmount, tokenSymbol, baseUsd, uniqueSuffix, rate }
 */
export function calculateCryptoAmount(totalIdr, orderId, customRate = null) {
    const rate = customRate || CRYPTO_USD_RATE;
    const cleanIdr = Math.max(0, Number(totalIdr) || 0);
    const numOrderId = Math.abs(parseInt(orderId, 10)) || 1;

    // 1. Hitung harga dasar dalam USD
    const baseUsd = cleanIdr / rate;

    // 2. Ambil nilai dasar dengan 1 digit di belakang koma (misal: 8.5)
    const baseTenths = Math.floor(baseUsd * 10) / 10;

    // 3. Ambil 2-3 digit mikro berdasarkan orderId (1 - 999)
    // Sesuai instruksi: order #1042 menghasilkan desimal .542 dari 8.50
    const rawSuffix = numOrderId % 1000;
    const uniqueSuffix = rawSuffix === 0 ? 1 : rawSuffix;

    // 8.5 + (42 / 1000) = 8.542
    const finalAmount = Number((baseTenths + (uniqueSuffix / 1000)).toFixed(3));

    return {
        expectedAmount: finalAmount,
        expectedAmountStr: finalAmount.toFixed(3),
        baseUsd: Number(baseUsd.toFixed(2)),
        uniqueSuffix,
        rate
    };
}

/**
 * Konversi nominal desimal string/number ke BigInt token units tanpa floating point error
 * @param {string|number} amount 
 * @param {number} decimals 
 * @returns {bigint}
 */
export function amountToTokenUnits(amount, decimals) {
    const str = String(amount).trim();
    const parts = str.split(".");
    const whole = parts[0] || "0";
    const frac = parts[1] || "";
    const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole + paddedFrac);
}

/**
 * Konversi BigInt token units ke representasi desimal string
 * @param {bigint} units 
 * @param {number} decimals 
 * @returns {string}
 */
export function tokenUnitsToAmount(units, decimals) {
    const str = units.toString().padStart(decimals + 1, "0");
    const whole = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
}

// ==============================================================================
// 4. PROTEKSI ANTI-DOUBLE-SPEND (REPLAY ATTACK PREVENTION)
// ==============================================================================
/**
 * Periksa apakah TxHash sudah pernah diklaim untuk pesanan lain
 * @param {string} txHash 
 * @returns {Promise<boolean>}
 */
export async function isTxHashAlreadyUsed(txHash) {
    if (!txHash) return false;
    const cleanHash = txHash.trim().toLowerCase();

    // 1. Cek di tabel Supabase crypto_payments jika tersedia
    if (isSupabaseConfigured() && supabaseAdmin) {
        try {
            const { data, error } = await supabaseAdmin
                .from("crypto_payments")
                .select("tx_hash, order_id")
                .eq("tx_hash", cleanHash)
                .maybeSingle();

            if (data && data.tx_hash) {
                return true;
            }
        } catch (dbErr) {
            console.warn("[Crypto Payment] Supabase tx_hash check error:", dbErr.message);
        }
    }

    return false;
}

/**
 * Catat transaksi crypto yang berhasil diverifikasi ke database Supabase
 */
export async function recordVerifiedCryptoPayment({
    orderId,
    txHash,
    network,
    tokenSymbol,
    amount,
    senderAddress,
    recipientAddress,
    blockNumber
}) {
    const cleanHash = txHash.trim().toLowerCase();
    const payload = {
        id: cleanHash,
        order_id: parseInt(orderId, 10),
        tx_hash: cleanHash,
        network: String(network),
        token_symbol: String(tokenSymbol),
        amount: Number(amount),
        sender_address: senderAddress || null,
        recipient_address: recipientAddress,
        block_number: blockNumber ? parseInt(blockNumber, 10) : null,
        status: "CONFIRMED",
        verified_at: new Date().toISOString()
    };

    if (isSupabaseConfigured() && supabaseAdmin) {
        try {
            const { error } = await supabaseAdmin
                .from("crypto_payments")
                .insert([payload]);

            if (error) {
                console.error("[Crypto Payment] Failed to insert crypto_payments record:", error.message);
            }
        } catch (e) {
            console.warn("[Crypto Payment] Supabase record exception:", e.message);
        }
    }

    return payload;
}

// ==============================================================================
// 5. MESIN VERIFIKASI ON-CHAIN EVM (BSC BEP-20 & POLYGON POS)
// ==============================================================================
/**
 * Verifikasi transaksi on-chain untuk jaringan EVM menggunakan JSON-RPC publik murni
 */
export async function verifyEvmTransaction({
    txHash,
    channelConfig,
    expectedAmount,
    expectedWalletAddress
}) {
    const cleanHash = txHash.trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(cleanHash)) {
        throw new Error("Format TxHash tidak valid. Wajib 64 karakter heksadesimal diawali '0x'.");
    }

    const recipientWallet = (expectedWalletAddress || channelConfig.walletAddress).toLowerCase();
    const acceptedContracts = channelConfig.acceptedContracts.map(c => c.toLowerCase());
    const decimals = channelConfig.decimals;
    const expectedUnits = amountToTokenUnits(expectedAmount, decimals);

    let receipt = null;
    let lastError = null;

    // Coba loop melalui daftar RPC publik
    for (const rpcUrl of channelConfig.rpcUrls) {
        try {
            const res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "eth_getTransactionReceipt",
                    params: [cleanHash],
                    id: 1
                }),
                signal: AbortSignal.timeout(8000)
            });

            if (!res.ok) continue;
            const data = await res.json();
            if (data?.result) {
                receipt = data.result;
                break;
            }
        } catch (fetchErr) {
            lastError = fetchErr;
        }
    }

    if (!receipt) {
        throw new Error(
            lastError?.message?.includes("timeout")
                ? "Koneksi ke node blockchain RPC timeout. Silakan klik verifikasi ulang dalam 5 detik."
                : "Transaksi belum tercatat di blockchain atau masih berada di antrean mempool. Tunggu 10–20 detik lalu coba lagi."
        );
    }

    // 1. Verifikasi Status Transaksi (0x1 = Sukses)
    if (receipt.status !== "0x1") {
        throw new Error("Transaksi gagal atau di-revert di blockchain (Status: Failed).");
    }

    // 2. Cari Event Log ERC-20 Transfer(address,address,uint256)
    const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
    let validTransferLog = null;
    let senderAddress = null;
    let transferredUnits = 0n;
    let matchedContract = null;

    for (const log of logs) {
        // Cek topic0 (Signature Transfer event)
        if (!log.topics || log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) {
            continue;
        }

        const logContract = log.address?.toLowerCase();
        // 3. Verifikasi Alamat Smart Contract Resmi
        if (!acceptedContracts.includes(logContract)) {
            continue;
        }

        // 4. Verifikasi Alamat Penerima (topics[2] adalah 'to' address, di-pad 32 bytes)
        if (!log.topics[2]) continue;
        const logRecipient = "0x" + log.topics[2].slice(26).toLowerCase();
        if (logRecipient !== recipientWallet) {
            continue;
        }

        // 5. Ekstraksi Nilai Transfer (log.data adalah uint256 transfer value)
        const logValue = BigInt(log.data || "0x0");
        if (logValue >= expectedUnits) {
            validTransferLog = log;
            senderAddress = log.topics[1] ? "0x" + log.topics[1].slice(26).toLowerCase() : null;
            transferredUnits = logValue;
            matchedContract = logContract;
            break;
        }
    }

    if (!validTransferLog) {
        // Berikan diagnosa mendalam untuk pembeli
        const transferLogsCount = logs.filter(l => l.topics?.[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC).length;
        if (transferLogsCount === 0) {
            throw new Error("Tidak ditemukan mutasi token ERC-20 pada transaksi ini.");
        }
        throw new Error(
            `Verifikasi gagal: Pastikan Anda mentransfer token resmi ke alamat ${recipientWallet} dengan nominal tepat ${expectedAmount} ${channelConfig.token}.`
        );
    }

    const actualAmountStr = tokenUnitsToAmount(transferredUnits, decimals);
    const blockNumber = receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null;

    return {
        success: true,
        network: channelConfig.network,
        token: channelConfig.token,
        txHash: cleanHash,
        senderAddress,
        recipientAddress: recipientWallet,
        expectedAmount: Number(expectedAmount),
        actualAmount: Number(actualAmountStr),
        contractAddress: matchedContract,
        blockNumber
    };
}

// ==============================================================================
// 6. MESIN VERIFIKASI ON-CHAIN TRON (TRC-20 USDT)
// ==============================================================================
/**
 * Verifikasi transaksi on-chain untuk jaringan TRON (TRC-20) via TronGrid API
 */
export async function verifyTronTransaction({
    txHash,
    channelConfig,
    expectedAmount,
    expectedWalletAddress
}) {
    let cleanHash = txHash.trim();
    if (cleanHash.startsWith("0x") || cleanHash.startsWith("0X")) {
        cleanHash = cleanHash.slice(2);
    }

    if (!/^[a-fA-F0-9]{64}$/.test(cleanHash)) {
        throw new Error("Format TxID TRON tidak valid. Wajib 64 karakter heksadesimal.");
    }

    const expectedWallet = expectedWalletAddress || channelConfig.walletAddress;
    const officialContract = channelConfig.contractAddress; // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
    const decimals = channelConfig.decimals; // 6
    const expectedUnits = amountToTokenUnits(expectedAmount, decimals);

    const apiUrl = channelConfig.apiUrl || TRONGRID_API_URL;

    // 1. Ambil detail transaksi untuk verifikasi status
    let txInfo = null;
    try {
        const infoRes = await fetch(`${apiUrl}/wallet/gettransactionbyid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: cleanHash }),
            signal: AbortSignal.timeout(8000)
        });

        if (infoRes.ok) {
            txInfo = await infoRes.json();
        }
    } catch (e) {
        console.warn("[TronGrid Info Error]", e.message);
    }

    if (!txInfo || !txInfo.txID) {
        throw new Error("Transaksi TRON belum ditemukan. Mohon tunggu 10–20 detik agar blok TRON terkonfirmasi.");
    }

    const contractRet = txInfo.ret?.[0]?.contractRet;
    if (contractRet && contractRet !== "SUCCESS") {
        throw new Error(`Transaksi TRON berstatus gagal di blockchain (${contractRet}).`);
    }

    // 2. Ambil log events TRC-20 Transfer
    let eventData = null;
    try {
        const eventRes = await fetch(`${apiUrl}/v1/transactions/${cleanHash}/events`, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(8000)
        });

        if (eventRes.ok) {
            eventData = await eventRes.json();
        }
    } catch (e) {
        console.warn("[TronGrid Events Error]", e.message);
    }

    const events = Array.isArray(eventData?.data) ? eventData.data : [];
    let validTransfer = null;

    for (const evt of events) {
        if (evt.event_name !== "Transfer") continue;

        // Verifikasi kontrak TRC-20 USDT
        if (evt.contract_address !== officialContract) continue;

        const result = evt.result || {};
        const recipient = result.to || "";
        const valueUnits = BigInt(result.value || "0");

        // Periksa kesamaan alamat penerima (Base58 atau insensitive)
        if (recipient.toLowerCase() === expectedWallet.toLowerCase()) {
            if (valueUnits >= expectedUnits) {
                validTransfer = {
                    event: evt,
                    from: result.from,
                    to: recipient,
                    valueUnits,
                    blockNumber: evt.block_number
                };
                break;
            }
        }
    }

    if (!validTransfer) {
        throw new Error(
            `Verifikasi TRON gagal: Pastikan Anda mentransfer minimal ${expectedAmount} USDT TRC-20 ke dompet ${expectedWallet}.`
        );
    }

    const actualAmountStr = tokenUnitsToAmount(validTransfer.valueUnits, decimals);

    return {
        success: true,
        network: channelConfig.network,
        token: channelConfig.token,
        txHash: cleanHash,
        senderAddress: validTransfer.from,
        recipientAddress: validTransfer.to,
        expectedAmount: Number(expectedAmount),
        actualAmount: Number(actualAmountStr),
        contractAddress: officialContract,
        blockNumber: validTransfer.blockNumber
    };
}

// ==============================================================================
// 7. ORCHESTRATOR UTAMA VERIFIKASI ON-CHAIN
// ==============================================================================
/**
 * Memvalidasi mutasi on-chain blockchain secara otomatis
 * 
 * @param {object} params
 * @param {string} params.txHash - Hash transaksi yang dimasukkan pembeli
 * @param {string} params.paymentChannel - ID kanal (CRYPTO_USDT_BEP20, dsb.)
 * @param {number|string} params.expectedAmount - Nominal tagihan presisi unik
 * @param {string} params.walletAddress - Alamat dompet tujuan
 * @returns {Promise<object>} Hasil verifikasi transaksi
 */
export async function verifyOnChainTransaction({
    txHash,
    paymentChannel,
    expectedAmount,
    walletAddress
}) {
    if (!txHash || typeof txHash !== "string") {
        throw new Error("Transaction Hash (TxID) wajib diisi.");
    }

    const channelConfig = getCryptoChannelConfig(paymentChannel);

    if (channelConfig.chainType === "evm") {
        return verifyEvmTransaction({
            txHash,
            channelConfig,
            expectedAmount,
            expectedWalletAddress: walletAddress
        });
    } else if (channelConfig.chainType === "tron") {
        return verifyTronTransaction({
            txHash,
            channelConfig,
            expectedAmount,
            expectedWalletAddress: walletAddress
        });
    }

    throw new Error(`Jaringan blockchain ${paymentChannel} belum didukung.`);
}

// ==============================================================================
// 8. NOTIFIKASI TELEGRAM ADMIN UNTUK PEMBAYARAN CRYPTO ON-CHAIN
// ==============================================================================
export async function sendTelegramCryptoAlert({
    order,
    verificationResult,
    channelConfig
}) {
    try {
        const adminChatId = getEnv("TELEGRAM_ADMIN_CHAT_ID");
        if (!adminChatId) return;

        const orderId = order.id;
        const buyerEmail = order.billing?.email || "-";
        const buyerPhone = order.billing?.phone || "-";
        const buyerName = `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim() || "Buyer";
        const txHash = verificationResult.txHash;
        const explorerLink = `${channelConfig.explorerBase}${txHash}`;

        const messageBody = `
🟢 <b>[CRYPTO PAYMENT CONFIRMED]</b> ⚡
🧾 <b>Order:</b> <code>#${orderId}</code> • <b>#ORDER_${orderId}</b>
💰 <b>Jumlah:</b> <code>${verificationResult.actualAmount} ${channelConfig.token}</code>
🌐 <b>Jaringan:</b> ${channelConfig.name}
👤 <b>Pembeli:</b> ${buyerName}
📧 <b>Email:</b> <code>${buyerEmail}</code> | 📱 <code>${buyerPhone}</code>

🔗 <b>TxHash (Blockchain):</b>
<code>${txHash}</code>
👉 <a href="${explorerLink}">Lihat di Blockchain Explorer</a>

🛡️ <i>Terverifikasi 100% on-chain tanpa perantara pihak ketiga. Pesanan otomatis diproses.</i>
`.trim();

        await sendTelegramMessage(adminChatId, messageBody, { parse_mode: "HTML" });
    } catch (e) {
        console.warn("[Telegram Crypto Alert Error]", e.message);
    }
}
