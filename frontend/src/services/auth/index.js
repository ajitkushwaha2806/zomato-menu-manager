import api from "@/lib/api/axios";
import { API_ENDPOINTS } from "../api-endpoints";

export const AuthService = {
    async getProfile() {
        try {
            const { data } = await api.get(API_ENDPOINTS.ACCOUNTS.ZOMATO_PROFILE);
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },
    async getAllRestaurant() {
        try {
            const { data } = await api.get(API_ENDPOINTS.ACCOUNTS.ZOMATO_RESTAURANTS);
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },
};