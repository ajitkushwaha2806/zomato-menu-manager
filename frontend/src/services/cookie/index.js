const ZOMATO_COOKIE_KEY = "zomato_cookie";
const PETPOOJA_COOKIE_KEY = "petpooja_cookie";

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

    // Helpers
    static has() {
        return !!this.get() && !!this.getSwiggyAccount();
    }
    static clear() {
        this.remove();
        this.removeSwiggyAccount();
        this.removePetpoojaCookie();
    }
}

export default CookieStorage;