import { createOrder, updateOrder, findOrCreateCustomer, generateSessionToken, getProductById } from '../../lib/wc';
import { createDuitkuInquiry, PAYMENT_CHANNELS } from '../../lib/duitku';
import { isCryptoChannel, getCryptoChannelConfig, calculateCryptoAmount } from '../../lib/crypto-payment.server';
import { validatePromoOrReferralCode, recordPendingReferralConversion } from '../../lib/referral-promo.server';
import { isValidEmail, sanitizeText } from '../../lib/sanitize';
import QRCode from 'qrcode';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { cartItems, customerInfo, paymentCategory, promoCode: rawPromoCode, appliedPromo } = body || {};
        const promoCode = sanitizeText(rawPromoCode || appliedPromo?.code || "", 40);

        // 1. Validasi Input Keranjang & Email
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > 50) {
            return new Response(JSON.stringify({
                success: false,
                error: "Keranjang belanja tidak valid atau kosong (maksimal 50 item)."
            }), { status: 400 });
        }

        if (!customerInfo || !customerInfo.email || !isValidEmail(customerInfo.email)) {
            return new Response(JSON.stringify({
                success: false,
                error: "Alamat email pelanggan tidak valid atau belum diisi."
            }), { status: 400 });
        }

        const cleanEmail = customerInfo.email.trim().toLowerCase();
        const cleanName = sanitizeText(customerInfo.name || "Customer", 60);
        const cleanWa = sanitizeText(customerInfo.wa || "", 30);
        const cleanDiscord = sanitizeText(customerInfo.discord || "", 50);

        // 2. Sanitasi & Validasi Line Items serta Verifikasi Ketersediaan Stok Real-Time
        const lineItems = [];
        const orderTargetSummaries = [];
        const structuredOrderTargets = [];
        let calculatedBaseTotalIdr = 0;

        for (const item of cartItems) {
            const productId = parseInt(item.id, 10);
            const quantity = Math.max(1, Math.min(99, parseInt(item.quantity || 1, 10)));

            if (!productId || isNaN(productId) || productId <= 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Format ID produk pada keranjang tidak valid."
                }), { status: 400 });
            }

            // Real-Time Stock & Existence Check di WooCommerce
            const product = await getProductById(productId, { bypassCache: true });
            if (!product || !product.id) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Produk ID #${productId} tidak ditemukan di katalog toko.`
                }), { status: 400 });
            }

            if (product.stock_status === "outofstock") {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Produk "${product.name || productId}" saat ini sedang habis.`
                }), { status: 400 });
            }

            calculatedBaseTotalIdr += Math.round(Number(product.price || 0) * quantity);

            // Ekstraksi Metadata Target Pemesanan
            const meta = item.orderMeta || {};
            const subCategoryMode = sanitizeText(meta.subCategoryMode || item.mode || "account", 30);
            const variantName = sanitizeText(meta.variantName || item.variant || "", 100);
            const robloxUsername = sanitizeText(meta.robloxUsername || item.robloxUsername || "", 50);
            const deliveryMethod = sanitizeText(meta.deliveryMethod || item.deliveryMethod || "", 50);
            const gameUid = sanitizeText(meta.gameUid || item.gameUserId || "", 50);
            const gameZone = sanitizeText(meta.gameZone || item.gameZoneId || "", 30);
            const inGameNickname = sanitizeText(meta.inGameNickname || item.gameNickname || "", 50);
            const gamepassTaxCalc = meta.gamepassTaxCalc || null;

            const lineItemMeta = [
                { key: "Sub Kategori", value: subCategoryMode },
                { key: "Kuantitas", value: String(quantity) }
            ];

            if (variantName) lineItemMeta.push({ key: "Varian", value: variantName });
            if (robloxUsername) lineItemMeta.push({ key: "Roblox Username", value: robloxUsername });
            if (deliveryMethod) lineItemMeta.push({ key: "Metode Pengiriman", value: deliveryMethod });
            if (gameUid) lineItemMeta.push({ key: "UID Game", value: gameUid });
            if (gameZone) lineItemMeta.push({ key: "Zone / Server ID", value: gameZone });
            if (inGameNickname) lineItemMeta.push({ key: "In-Game Nickname", value: inGameNickname });
            if (gamepassTaxCalc && gamepassTaxCalc.requiredGamepassPrice) {
                lineItemMeta.push({ key: "Set Gamepass Price (Pajak 30%)", value: `${gamepassTaxCalc.requiredGamepassPrice} Robux` });
            }

            lineItems.push({
                product_id: productId,
                quantity: quantity,
                meta_data: lineItemMeta
            });

            // Target note summary per product
            let targetNote = "";
            if (subCategoryMode === "roblox_item" || robloxUsername) {
                targetNote = `Roblox: ${robloxUsername || '@User'} (Metode: ${deliveryMethod || 'In-Game'})`;
            } else if (gameUid) {
                targetNote = `UID: ${gameUid}${gameZone ? ` (${gameZone})` : ''}${inGameNickname ? ` [Nick: ${inGameNickname}]` : ''}`;
            } else {
                targetNote = `Pengiriman Akun ke ${cleanEmail}`;
            }

            orderTargetSummaries.push(`• ${product.name || `Item #${productId}`}${variantName ? ` [${variantName}]` : ''} (${quantity}x) -> ${targetNote}`);
            structuredOrderTargets.push({
                productId,
                productName: product.name,
                quantity,
                subCategoryMode,
                variantName,
                robloxUsername,
                deliveryMethod,
                gameUid,
                gameZone,
                inGameNickname,
                gamepassTaxCalc
            });
        }

        // Validasi Ulang Server-Side Kode Promo / Referral (Anti-Cheat & Anti-Self-Referral)
        let promoValidation = null;
        if (promoCode) {
            promoValidation = await validatePromoOrReferralCode({
                code: promoCode,
                cartTotalIdr: calculatedBaseTotalIdr,
                buyerEmail: cleanEmail,
                orderTargetDetails: structuredOrderTargets,
                buyerWa: cleanWa
            });

            if (!promoValidation.valid) {
                return new Response(JSON.stringify({
                    success: false,
                    error: promoValidation.message || "Kode promo atau referral tidak valid."
                }), { status: 400 });
            }
        }

        // 3. Auto-Create / Hubungkan Customer WooCommerce
        let customerId = 0;
        try {
            const customer = await findOrCreateCustomer({
                email: cleanEmail,
                firstName: cleanName,
                phone: cleanWa,
            });
            if (customer && customer.id) {
                customerId = customer.id;
            }
        } catch (e) {
            console.warn("Lanjut sebagai guest karena pembuatan customer gagal:", e.message);
        }

        // Tentukan Nama Metode Pembayaran (Crypto vs Duitku)
        const isCrypto = isCryptoChannel(paymentCategory);
        let methodCode = "SP";
        let methodName = "QRIS";
        let paymentMethodId = "duitku";
        let paymentMethodTitle = "Duitku - QRIS";
        let cryptoConfig = null;

        if (isCrypto) {
            cryptoConfig = getCryptoChannelConfig(paymentCategory);
            methodCode = cryptoConfig.id;
            methodName = cryptoConfig.name;
            paymentMethodId = "crypto";
            paymentMethodTitle = `Crypto - ${cryptoConfig.name}`;
        } else {
            const selectedChannel = PAYMENT_CHANNELS[paymentCategory] || PAYMENT_CHANNELS["qris"];
            methodCode = selectedChannel.code || "SP";
            methodName = selectedChannel.name || "QRIS";
            paymentMethodId = "duitku";
            paymentMethodTitle = `Duitku - ${methodName}`;
        }

        // 4. Payload Order untuk WooCommerce REST API
        const customerNote = [
            `Kontak: WA: ${cleanWa || '-'} | Email: ${cleanEmail} | Discord: ${cleanDiscord || '-'}`,
            `Metode Bayar: ${methodName} (${methodCode})`,
            promoValidation ? `Promo/Referral: ${promoValidation.code} (Diskon: Rp ${promoValidation.discountAmount.toLocaleString("id-ID")})` : null,
            `Target Pengiriman:\n${orderTargetSummaries.join("\n")}`
        ].filter(Boolean).join("\n");

        const orderMetaData = [
            { key: "_order_target_details", value: JSON.stringify(structuredOrderTargets) },
            { key: "_buyer_wa", value: cleanWa },
            { key: "_buyer_discord", value: cleanDiscord }
        ];

        if (promoValidation) {
            orderMetaData.push(
                { key: "_promo_code", value: promoValidation.code },
                { key: "_promo_type", value: promoValidation.type },
                { key: "_promo_discount_amount", value: String(promoValidation.discountAmount) },
                { key: "_promo_referrer_email", value: promoValidation.referrerEmail || "" }
            );
        }

        const orderPayload = {
            payment_method: paymentMethodId,
            payment_method_title: paymentMethodTitle,
            set_paid: false,
            customer_id: customerId,
            billing: {
                first_name: cleanName,
                last_name: "",
                email: cleanEmail,
                phone: cleanWa,
                address_1: "Digital Product Delivery",
                city: "Jakarta",
                postcode: "12345",
                country: "ID",
            },
            line_items: lineItems,
            customer_note: customerNote,
            meta_data: orderMetaData
        };

        if (promoValidation) {
            if (promoValidation.type === "wc_coupon") {
                orderPayload.coupon_lines = [{ code: promoValidation.code }];
            } else {
                orderPayload.fee_lines = [
                    {
                        name: `Discount (${promoValidation.code})`,
                        total: `-${promoValidation.discountAmount}`
                    }
                ];
            }
        }

        const order = await createOrder(orderPayload);
        let orderTotal = Math.round(Number(order.total) || 0);

        // Koreksi total jika fee_lines negatif tidak terhitung di total WooCommerce
        if (promoValidation && promoValidation.discountAmount > 0) {
            const expectedDiscounted = Math.max(0, calculatedBaseTotalIdr - promoValidation.discountAmount);
            if (orderTotal > expectedDiscounted && (orderTotal - expectedDiscounted >= promoValidation.discountAmount - 100)) {
                orderTotal = expectedDiscounted;
            }
        }

        // Catat konversi referral ke status pending
        if (promoValidation && promoValidation.type === "referral") {
            try {
                await recordPendingReferralConversion({
                    referralCode: promoValidation.code,
                    referrerEmail: promoValidation.referrerEmail,
                    buyerEmail: cleanEmail,
                    orderId: String(order.id),
                    orderTotalIdr: orderTotal,
                    discountAmountIdr: promoValidation.discountAmount,
                    commissionAmountIdr: promoValidation.commissionAmount
                });
            } catch (refErr) {
                console.warn("[Referral Pending Error]", refErr.message);
            }
        }

        // 5. Inisialisasi Gateway (Crypto On-Chain Terminal vs Duitku Inquiry)
        let merchantOrderId = null;
        let paymentDetails = null;

        if (isCrypto && cryptoConfig) {
            // === ALUR CRYPTO GATEWAY (SELF-HOSTED ON-CHAIN) ===
            const cryptoCalc = calculateCryptoAmount(orderTotal, order.id);
            const expectedAmount = cryptoCalc.expectedAmount;
            const cryptoExpiryTime = Date.now() + 60 * 60 * 1000; // 60 Menit batas waktu transfer crypto

            let cryptoQrDataUrl = null;
            try {
                cryptoQrDataUrl = await QRCode.toDataURL(cryptoConfig.walletAddress, {
                    width: 320,
                    margin: 2,
                    color: { dark: "#000000", light: "#ffffff" }
                });
            } catch (qrErr) {
                console.warn("[Crypto QR Error]", qrErr.message);
            }

            // Simpan detail tagihan crypto ke meta_data WooCommerce
            await updateOrder(order.id, {
                meta_data: [
                    { key: "_crypto_payment_channel", value: cryptoConfig.id },
                    { key: "_crypto_token_symbol", value: cryptoConfig.token },
                    { key: "_crypto_network", value: cryptoConfig.network },
                    { key: "_crypto_network_name", value: cryptoConfig.name },
                    { key: "_crypto_expected_amount", value: String(expectedAmount) },
                    { key: "_crypto_wallet_address", value: cryptoConfig.walletAddress },
                    { key: "_crypto_contract_address", value: cryptoConfig.contractAddress },
                    { key: "_crypto_contract_display", value: cryptoConfig.contractDisplay },
                    { key: "_crypto_expiry_time", value: String(cryptoExpiryTime) },
                    { key: "_crypto_status", value: "PENDING_VERIFICATION" }
                ]
            });

            merchantOrderId = `CRYPTO-${order.id}`;
            paymentDetails = {
                method: cryptoConfig.id,
                methodName: cryptoConfig.name,
                isCrypto: true,
                crypto: {
                    expectedAmount,
                    expectedAmountStr: cryptoCalc.expectedAmountStr,
                    tokenSymbol: cryptoConfig.token,
                    network: cryptoConfig.network,
                    networkName: cryptoConfig.name,
                    walletAddress: cryptoConfig.walletAddress,
                    contractAddress: cryptoConfig.contractAddress,
                    contractDisplay: cryptoConfig.contractDisplay,
                    qrDataUrl: cryptoQrDataUrl,
                    expiryTime: cryptoExpiryTime
                }
            };
        } else {
            // === ALUR DUITKU GATEWAY (HEADLESS DIRECT API) ===
            merchantOrderId = `YG-${order.id}-${Math.floor(1000 + Math.random() * 9000)}`;
            const productSummary = cartItems
                .map(i => sanitizeText(i.name || "Item", 30))
                .join(", ")
                .slice(0, 100);

            let duitkuRes = null;
            let qrDataUrl = null;

            try {
                duitkuRes = await createDuitkuInquiry({
                    merchantOrderId,
                    paymentAmount: orderTotal,
                    paymentMethod: methodCode,
                    productDetails: productSummary || "Yasui Game Digital Account",
                    email: cleanEmail,
                    phoneNumber: cleanWa && cleanWa !== "-" ? cleanWa : "08123456789",
                    customerVaName: cleanName || "Yasui Buyer",
                    expiryPeriod: 15 // 15 Menit
                });

                // Jika QRIS, generate Data URL QR Code
                if (duitkuRes.qrString) {
                    qrDataUrl = await QRCode.toDataURL(duitkuRes.qrString, {
                        width: 320,
                        margin: 2,
                        color: { dark: "#000000", light: "#ffffff" }
                    });
                }

                // Simpan metadata Duitku ke Order WooCommerce
                await updateOrder(order.id, {
                    meta_data: [
                        { key: "_duitku_merchant_order_id", value: merchantOrderId },
                        { key: "_duitku_reference", value: duitkuRes.reference || "" },
                        { key: "_duitku_payment_method", value: methodCode },
                        { key: "_duitku_payment_method_name", value: methodName },
                        { key: "_duitku_va_number", value: duitkuRes.vaNumber || "" },
                        { key: "_duitku_qr_string", value: duitkuRes.qrString || "" },
                        { key: "_duitku_payment_url", value: duitkuRes.paymentUrl || "" },
                        { key: "_duitku_expiry_time", value: String(Date.now() + 15 * 60 * 1000) }
                    ]
                });

                paymentDetails = {
                    method: methodCode,
                    methodName: methodName,
                    isCrypto: false,
                    reference: duitkuRes.reference,
                    vaNumber: duitkuRes.vaNumber || null,
                    qrString: duitkuRes.qrString || null,
                    qrDataUrl: qrDataUrl,
                    paymentUrl: duitkuRes.paymentUrl || null
                };
            } catch (duitkuError) {
                console.error("Duitku Inquiry Failed:", duitkuError.message);
                throw new Error(`Gagal menghubungi gateway pembayaran Duitku: ${duitkuError.message}`);
            }
        }

        // 6. Headless Order Pay URL dengan Proteksi Order Key
        const paymentPayUrl = `/order-pay?id=${order.id}&key=${encodeURIComponent(order.order_key)}`;

        // 7. Generate Signed Session Token (Otomatis login 30 hari untuk pembeli)
        const userSession = generateSessionToken(cleanEmail);

        return new Response(JSON.stringify({
            success: true,
            order: {
                id: order.id,
                orderKey: order.order_key,
                orderNumber: order.number || order.id,
                merchantOrderId,
                status: order.status,
                total: order.total,
                currency: order.currency
            },
            session: {
                token: userSession.token,
                expiresAt: userSession.expiresAt,
                email: cleanEmail,
                name: cleanName
            },
            payment: paymentDetails,
            paymentUrl: paymentPayUrl
        }), { status: 200 });

    } catch (error) {
        console.error("Create Order Error:", error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Gagal membuat pesanan."
        }), { status: 500 });
    }
};
