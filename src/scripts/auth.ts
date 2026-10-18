import type { UserSession } from "../types";

export function getSession(): UserSession | null {
    try {
        const raw = localStorage.getItem("yasui_session");
        if (raw) {
            const session: UserSession = JSON.parse(raw);
            if (!session.expiresAt || Date.now() <= session.expiresAt) {
                return session;
            }
            localStorage.removeItem("yasui_session");
        }
        const savedEmail = localStorage.getItem("yasui_buyer_email");
        if (savedEmail) {
            const autoSession: UserSession = {
                email: savedEmail,
                name: savedEmail.split("@")[0],
                isGuestBuyer: true,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
            };
            localStorage.setItem("yasui_session", JSON.stringify(autoSession));
            return autoSession;
        }
        return null;
    } catch {
        return null;
    }
}

export function updateNavAuthUI(): void {
    const session = getSession();
    const loginBtn = document.getElementById("nav-login-btn");
    const userDropdown = document.getElementById("nav-user-dropdown");
    const userName = document.getElementById("nav-user-name");
    const userInitial = document.getElementById("nav-user-initial");
    const menuEmail = document.getElementById("nav-menu-email");
    const mobileLabel = document.getElementById("mobile-nav-label");

    const lang = localStorage.getItem("yasui_lang") || "id";

    if (session && session.email) {
        const currentEmail = session.email;
        const displayName = session.name || currentEmail.split("@")[0];

        if (loginBtn) {
            loginBtn.style.setProperty("display", "none", "important");
            loginBtn.classList.add("hidden");
            loginBtn.classList.remove("flex");
        }
        if (userDropdown) {
            userDropdown.style.setProperty("display", "block", "important");
            userDropdown.classList.remove("hidden");
            userDropdown.classList.add("block");
        }
        if (userName) userName.innerText = displayName;
        if (userInitial) userInitial.innerText = displayName.charAt(0).toUpperCase();
        if (menuEmail) menuEmail.innerText = currentEmail;
        if (mobileLabel) mobileLabel.innerText = lang === "en" ? "ACCOUNT" : "AKUN";
    } else {
        if (loginBtn) {
            loginBtn.style.setProperty("display", "flex", "important");
            loginBtn.classList.remove("hidden");
            loginBtn.classList.add("flex");
        }
        if (userDropdown) {
            userDropdown.style.setProperty("display", "none", "important");
            userDropdown.classList.add("hidden");
            userDropdown.classList.remove("block");
        }
        if (mobileLabel) mobileLabel.innerText = lang === "en" ? "LOGIN" : "MASUK";
    }
}

export function openAuthModal(mode = "login"): void {
    const modal = document.getElementById("global-auth-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const savedEmail = localStorage.getItem("yasui_buyer_email") || "";
    const loginEmailInput = document.getElementById("auth-login-email") as HTMLInputElement | null;
    if (loginEmailInput && savedEmail && !loginEmailInput.value) {
        loginEmailInput.value = savedEmail;
    }
}

export function closeAuthModal(): void {
    const modal = document.getElementById("global-auth-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    const alert = document.getElementById("auth-modal-alert");
    if (alert) alert.classList.add("hidden");
}

export function toggleUserMenu(): void {
    const menu = document.getElementById("nav-user-menu");
    if (menu) menu.classList.toggle("hidden");
}

export function togglePasswordVisibility(inputId: string, btn: HTMLElement): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    btn.innerHTML = isPwd
        ? '<div class="i-lucide-eye-off text-sm"></div>'
        : '<div class="i-lucide-eye text-sm"></div>';
}

export async function handleAuthLogin(e: Event): Promise<void> {
    e.preventDefault();
    const email = (document.getElementById("auth-login-email") as HTMLInputElement | null)?.value.trim();
    const password = (document.getElementById("auth-login-password") as HTMLInputElement | null)?.value;
    const btn = document.getElementById("btn-submit-login") as HTMLButtonElement | null;
    const alert = document.getElementById("auth-modal-alert");

    if (!email || !password || !btn || !alert) return;

    btn.disabled = true;
    btn.innerText = "MEMERIKSA KREDENSIAL...";
    alert.classList.add("hidden");

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || "Email atau kata sandi tidak cocok.");
        }

        localStorage.setItem("yasui_session", JSON.stringify({
            ...(data.user || {}),
            email,
            token: data.session?.token,
            expiresAt: data.session?.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000)
        }));
        localStorage.setItem("yasui_buyer_email", email);

        alert.className = "mb-4 p-3 rounded-lg text-xs font-mono bg-green-950/60 border border-green-500/50 text-green-400 block";
        alert.innerText = "Login berhasil! Memuat dashboard...";

        updateNavAuthUI();
        document.dispatchEvent(new Event("yasui-auth-changed"));

        setTimeout(() => {
            closeAuthModal();
            if (window.location.pathname.includes("/orders")) {
                window.location.reload();
            } else {
                window.location.href = "/orders";
            }
        }, 800);
    } catch (err: any) {
        alert.className = "mb-4 p-3 rounded-lg text-xs font-mono bg-red-950/60 border border-red-500/50 text-red-400 block";
        alert.innerText = err.message || "Gagal masuk. Silakan coba lagi.";
        btn.disabled = false;
        btn.innerHTML = '<span>MASUK SEKARANG</span><div class="i-lucide-arrow-right text-sm"></div>';
    }
}

export function openSetPasswordModal(): void {
    closeAuthModal();
    const modal = document.getElementById("global-set-password-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const session = getSession();
    const savedEmail = session?.email || localStorage.getItem("yasui_buyer_email") || "";
    const emailInput = document.getElementById("set-pwd-email") as HTMLInputElement | null;
    if (emailInput && savedEmail) emailInput.value = savedEmail;
}

export function closeSetPasswordModal(): void {
    const modal = document.getElementById("global-set-password-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    const alert = document.getElementById("set-pwd-alert");
    if (alert) alert.classList.add("hidden");
}

export async function handleSetPassword(e: Event): Promise<void> {
    e.preventDefault();
    const email = (document.getElementById("set-pwd-email") as HTMLInputElement | null)?.value.trim();
    const newPwd = (document.getElementById("set-pwd-new") as HTMLInputElement | null)?.value;
    const confirmPwd = (document.getElementById("set-pwd-confirm") as HTMLInputElement | null)?.value;
    const btn = document.getElementById("btn-submit-pwd") as HTMLButtonElement | null;
    const alert = document.getElementById("set-pwd-alert");

    if (!btn || !alert) return;

    if (newPwd !== confirmPwd) {
        alert.className = "mb-4 p-3 rounded-lg text-xs font-mono bg-red-950/60 border border-red-500/50 text-red-400 block";
        alert.innerText = "Konfirmasi kata sandi tidak cocok.";
        return;
    }

    btn.disabled = true;
    btn.innerText = "MENYIMPAN KATA SANDI...";

    try {
        const session = getSession();
        const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (session && session.token) {
            authHeaders["Authorization"] = `Bearer ${session.token}`;
        }
        const res = await fetch("/api/auth/set-password", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                email,
                password: newPwd,
                token: session?.token || null
            })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || "Gagal menyimpan kata sandi.");
        }

        if (data.session?.token && email) {
            localStorage.setItem("yasui_session", JSON.stringify({
                ...(data.user || {}),
                email,
                token: data.session.token,
                expiresAt: data.session.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000)
            }));
            localStorage.setItem("yasui_buyer_email", email);
            updateNavAuthUI();
            document.dispatchEvent(new Event("yasui-auth-changed"));
        }

        alert.className = "mb-4 p-3 rounded-lg text-xs font-mono bg-green-950/60 border border-green-500/50 text-green-400 block";
        alert.innerText = "Kata sandi Anda berhasil disimpan! Sesi Anda kini aman.";

        setTimeout(() => {
            closeSetPasswordModal();
            btn.disabled = false;
            btn.innerHTML = '<span>SIMPAN KATA SANDI</span><div class="i-lucide-shield-check text-sm"></div>';
            if (window.location.pathname.includes("/orders")) {
                window.location.reload();
            }
        }, 1200);
    } catch (err: any) {
        alert.className = "mb-4 p-3 rounded-lg text-xs font-mono bg-red-950/60 border border-red-500/50 text-red-400 block";
        alert.innerText = err.message || "Gagal memperbarui kata sandi.";
        btn.disabled = false;
        btn.innerHTML = '<span>SIMPAN KATA SANDI</span><div class="i-lucide-shield-check text-sm"></div>';
    }
}

export function logoutUser(): void {
    localStorage.removeItem("yasui_session");
    localStorage.removeItem("yasui_buyer_email");
    updateNavAuthUI();
    document.dispatchEvent(new Event("yasui-auth-changed"));

    if (window.location.pathname.includes("/orders")) {
        window.location.reload();
    }
}

export function initAuth(): void {
    // Expose helpers for template inline handlers & external pages
    (window as any).getSession = getSession;
    (window as any).updateNavAuthUI = updateNavAuthUI;
    (window as any).openAuthModal = openAuthModal;
    (window as any).closeAuthModal = closeAuthModal;
    (window as any).toggleUserMenu = toggleUserMenu;
    (window as any).togglePasswordVisibility = togglePasswordVisibility;
    (window as any).handleAuthLogin = handleAuthLogin;
    (window as any).openSetPasswordModal = openSetPasswordModal;
    (window as any).closeSetPasswordModal = closeSetPasswordModal;
    (window as any).handleSetPassword = handleSetPassword;
    (window as any).logoutUser = logoutUser;

    document.addEventListener("click", (e) => {
        const container = document.getElementById("nav-user-dropdown");
        const menu = document.getElementById("nav-user-menu");
        if (container && menu && !container.contains(e.target as Node)) {
            menu.classList.add("hidden");
        }
    });

    const mobileAuthBtn = document.getElementById("mobile-nav-auth");
    if (mobileAuthBtn) {
        mobileAuthBtn.addEventListener("click", (e) => {
            const session = getSession();
            if (!session || !session.email) {
                e.preventDefault();
                openAuthModal("login");
            }
        });
    }

    updateNavAuthUI();
    window.addEventListener("storage", updateNavAuthUI);
    document.addEventListener("yasui-auth-changed", updateNavAuthUI);
}
