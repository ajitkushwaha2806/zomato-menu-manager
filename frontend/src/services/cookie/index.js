const STORAGE_KEY = "zomato_cookie";

class CookieStorage {
    static get() {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(STORAGE_KEY);
    }

    static set(cookie) {
        if (typeof window === "undefined") return;
        localStorage.setItem(STORAGE_KEY, cookie.trim());
    }

    static remove() {
        if (typeof window === "undefined") return;
        localStorage.removeItem(STORAGE_KEY);
    }

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

    static has() {
        return !!this.get() && !!this.getSwiggyAccount();
    }

    static clear() {
        this.remove();
        this.removeSwiggyAccount();
    }
}

export default CookieStorage;