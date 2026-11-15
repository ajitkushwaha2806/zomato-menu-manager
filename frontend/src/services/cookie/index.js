const ZOMATO_COOKIE_KEY = "zomato_cookie";
const PETPOOJA_COOKIE_KEY = "petpooja_cookie";
const OWNLY_COOKIE_KEY = "ownly_cookie";

class CookieStorage {
    // Zomato cookie
    static get() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(ZOMATO_COOKIE_KEY);
    }
    static set(cookie) {
        if (typeof window === "undefined") return;
        localStorage.setItem(ZOMATO_COOKIE_KEY, cookie.trim());
    }
    static remove() {
        if (typeof window === "undefined") return;
        localStorage.removeItem(ZOMATO_COOKIE_KEY);
    }

    // Zomato account name
    static getZomatoAccount() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("zomato_account");
    }
    static setZomatoAccount(name) {
        if (typeof window === "undefined" || !name) return;
        localStorage.setItem("zomato_account", name.trim());
    }
    static removeZomatoAccount() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("zomato_account");
    }

    // Swiggy account name
    static getSwiggyAccount() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("swiggy_account");
    }
    static setSwiggyAccount(accountName) {
        if (typeof window === "undefined") return;
        localStorage.setItem("swiggy_account", accountName.trim());
    }
    static removeSwiggyAccount() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("swiggy_account");
    }

    // Petpooja cookie
    static getPetpoojaCookie() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(PETPOOJA_COOKIE_KEY);
    }
    static setPetpoojaCookie(cookie) {
        if (typeof window === "undefined") return;
        localStorage.setItem(PETPOOJA_COOKIE_KEY, cookie.trim());
    }
    static removePetpoojaCookie() {
        if (typeof window === "undefined") return;
        localStorage.removeItem(PETPOOJA_COOKIE_KEY);
    }

    // Petpooja account name
    static getPetpoojaAccount() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("petpooja_account");
    }
    static setPetpoojaAccount(name) {
        if (typeof window === "undefined" || !name) return;
        localStorage.setItem("petpooja_account", name.trim());
    }
    static removePetpoojaAccount() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("petpooja_account");
    }

    // Ownly cookie
    static getOwnlyCookie() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(OWNLY_COOKIE_KEY);
    }
    static setOwnlyCookie(cookie) {
        if (typeof window === "undefined") return;
        localStorage.setItem(OWNLY_COOKIE_KEY, cookie.trim());
    }
    static removeOwnlyCookie() {
        if (typeof window === "undefined") return;
        localStorage.removeItem(OWNLY_COOKIE_KEY);
    }

    // Ownly account name
    static getOwnlyAccount() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("ownly_account");
    }
    static setOwnlyAccount(name) {
        if (typeof window === "undefined" || !name) return;
        localStorage.setItem("ownly_account", name.trim());
    }
    static removeOwnlyAccount() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("ownly_account");
    }

    // Active Platform
    static getActivePlatform() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("activePlatform");
    }
    static setActivePlatform(platform) {
        if (typeof window === "undefined") return;
        localStorage.setItem("activePlatform", platform);
    }
    static removeActivePlatform() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("activePlatform");
    }

    // Account Name
    static getAccountName() {
        if (typeof window === "undefined") return null;
        const active = this.getActivePlatform();
        if (active === "ownly" && this.getOwnlyAccount()) return this.getOwnlyAccount();
        if (active === "petpooja" && this.getPetpoojaAccount()) return this.getPetpoojaAccount();
        if (active === "swiggy" && this.getSwiggyAccount()) return this.getSwiggyAccount();
        if (active === "zomato" && this.getZomatoAccount()) return this.getZomatoAccount();
        return localStorage.getItem("account_name");
    }
    static setAccountName(name) {
        if (typeof window === "undefined") return;
        localStorage.setItem("account_name", name.trim());
    }
    static removeAccountName() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("account_name");
    }

    // Application Password Protection
    static isAppUnlocked() {
        if (typeof window === "undefined") return false;
        const local = localStorage.getItem("app_unlocked");
        if (local === "true") return true;
        const match = document.cookie.match(new RegExp("(^| )app_unlocked=([^;]+)"));
        return match ? match[2] === "true" : false;
    }
    static setAppUnlocked() {
        if (typeof window === "undefined") return;
        localStorage.setItem("app_unlocked", "true");
        document.cookie = "app_unlocked=true; path=/; max-age=2592000; SameSite=Lax";
    }
    static lockApp() {
        if (typeof window === "undefined") return;
        localStorage.removeItem("app_unlocked");
        document.cookie = "app_unlocked=; path=/; max-age=0; SameSite=Lax";
    }

    // Helpers
    static getConnectedPlatforms() {
        if (typeof window === "undefined") return [];
        const platforms = [];
        if (this.get()) platforms.push("zomato");
        if (this.getSwiggyAccount()) platforms.push("swiggy");
        if (this.getPetpoojaCookie()) platforms.push("petpooja");
        if (this.getOwnlyCookie()) platforms.push("ownly");
        return platforms;
    }
    static has() {
        return this.getConnectedPlatforms().length > 0;
    }
    static clear() {
        this.remove();
        this.removeZomatoAccount();
        this.removeSwiggyAccount();
        this.removePetpoojaCookie();
        this.removePetpoojaAccount();
        this.removeOwnlyCookie();
        this.removeOwnlyAccount();
        this.removeActivePlatform();
        this.removeAccountName();
    }
}

export default CookieStorage;