import api from "@/lib/api/axios";
import { API_ENDPOINTS } from "../api-endpoints";

export const MenuService = {
    async getZomatoMenu(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.ZOMATO_MENU_IMPORT(resId));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },

    async syncSwiggyMenu(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.SWIGGY_MENU_IMPORT(resId));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },

    async getMenu(resId, platform) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.GET_MENU(resId, platform));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },

    async saveMenu(resId, payload, platform) {
        try {
            const { data } = await api.put(API_ENDPOINTS.MENU.UPDATE_MENU(resId, platform), payload);
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to save menu."
            );
        }
    }
};