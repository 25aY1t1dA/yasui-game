export function openLiveChatModal(): void {
    const modal = document.getElementById("global-livechat-modal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        modal.setAttribute("aria-hidden", "false");
        setTimeout(() => {
            (document.getElementById("livechat-input") as HTMLInputElement | null)?.focus();
        }, 100);
    }
}

export function closeLiveChatModal(): void {
    const modal = document.getElementById("global-livechat-modal");
    if (modal) {
        modal.classList.remove("flex");
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
    }
}

export function sendQuickChatMessage(text: string): void {
    const input = document.getElementById("livechat-input") as HTMLInputElement | null;
    if (input) {
        input.value = text;
        const form = document.getElementById("livechat-form") as HTMLFormElement | null;
        if (form) form.dispatchEvent(new Event("submit"));
    }
}

export function handleLiveChatSubmit(e: Event): void {
    e.preventDefault();
    const input = document.getElementById("livechat-input") as HTMLInputElement | null;
    const container = document.getElementById("livechat-messages");
    const typing = document.getElementById("livechat-typing");
    if (!input || !container) return;

    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    const userBubble = document.createElement("div");
    userBubble.className = "flex justify-end";
    userBubble.innerHTML = `
        <div class="bg-cyan-950/80 border border-cyan-500/50 rounded-2xl rounded-tr-sm p-3 text-cyan-200 shadow-sm leading-relaxed max-w-[85%] text-left">
            ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>
    `;
    container.appendChild(userBubble);
    container.scrollTop = container.scrollHeight;

    if (typing) typing.classList.remove("hidden");
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
        if (typing) typing.classList.add("hidden");

        let reply = "Pesan Anda telah diteruskan ke Admin Yasui Game. Kami akan segera membalasnya di sini. Untuk proses transaksi atau kirim bukti bayar, Anda juga bisa langsung chat ke WhatsApp kami.";
        const lower = text.toLowerCase();
        if (lower.includes("lama") || lower.includes("proses") || lower.includes("kirim")) {
            reply = "Proses pengiriman akun rata-rata memakan waktu 1-5 menit setelah pembayaran berhasil diverifikasi. Akun langsung aktif dan bergaransi!";
        } else if (lower.includes("garansi") || lower.includes("hackback") || lower.includes("aman")) {
            reply = "Semua akun di Yasui Game dilindungi Garansi Anti-Hackback 100%. Jika ada kendala, admin siap mengganti akun baru atau refund penuh sesuai ketentuan!";
        } else if (lower.includes("qris") || lower.includes("bayar") || lower.includes("dana") || lower.includes("gopay")) {
            reply = "Kami menerima pembayaran otomatis via QRIS (BCA, Mandiri, BRI, Dana, OVO, GoPay, ShopeePay) dan Virtual Account dengan konfirmasi instan!";
        }

        const adminBubble = document.createElement("div");
        adminBubble.className = "flex items-start gap-2 max-w-[85%]";
        adminBubble.innerHTML = `
            <div class="w-6 h-6 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                Y
            </div>
            <div class="bg-gray-900/90 border border-gray-800 rounded-2xl rounded-tl-sm p-3 text-gray-200 shadow-sm leading-relaxed">
                ${reply}
            </div>
        `;
        container.appendChild(adminBubble);
        container.scrollTop = container.scrollHeight;
    }, 800);
}

export function initLiveChat(): void {
    (window as any).openLiveChatModal = openLiveChatModal;
    (window as any).closeLiveChatModal = closeLiveChatModal;
    (window as any).sendQuickChatMessage = sendQuickChatMessage;
    (window as any).handleLiveChatSubmit = handleLiveChatSubmit;

    const chatModal = document.getElementById("global-livechat-modal");
    if (chatModal) {
        chatModal.addEventListener("click", (e) => {
            if (e.target === chatModal) closeLiveChatModal();
        });
    }

    closeLiveChatModal();
}

