export interface PromoSlide {
    image: string;
    title: string;
    subtitle: string;
    color: string;
}

export interface RobloxServiceGroup {
    key: string;
    name: string;
    detail: string;
    icon: string;
    slugs: string[];
}

export interface UserSession {
    email: string;
    name?: string;
    token?: string;
    isGuestBuyer?: boolean;
    expiresAt?: number;
}

export interface CartItem {
    id: number;
    globalId?: string;
    name: string;
    slug: string;
    price: number;
    image?: string;
    email?: string;
    contactMethod?: 'whatsapp' | 'discord';
    contactValue?: string;
    playerInGameId?: string;
    wa?: string;
    timestamp: number;
}
