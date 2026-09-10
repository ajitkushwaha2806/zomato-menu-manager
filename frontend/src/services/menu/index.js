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

    async syncPetpoojaMenu(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.PETPOOJA_MENU_IMPORT(resId));
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
    },

    async getFailedJobs() {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.GET_FAILED_JOBS());
            return data?.data || [];
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to fetch jobs."
            );
        }
    },

    async getAllJobs(params = {}) {
        try {
            const query = new URLSearchParams(params).toString();
            const { data } = await api.get(API_ENDPOINTS.MENU.GET_ALL_JOBS(query));
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to fetch queues and jobs."
            );
        }
    },

    async getJobDetails(jobId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.GET_JOB_DETAILS(jobId));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to fetch job details."
            );
        }
    },

    async appendJobToMenu(jobId, payload = {}) {
        try {
            const { data } = await api.post(API_ENDPOINTS.MENU.APPEND_JOB_TO_MENU(jobId), payload);
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to append menu from queue job."
            );
        }
    },

    async deleteJob(jobId) {
        try {
            const { data } = await api.delete(API_ENDPOINTS.MENU.DELETE_JOB(jobId));
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to delete job."
            );
        }
    },

    async resumeJob(jobId) {
        try {
            const { data } = await api.post(API_ENDPOINTS.MENU.RESUME_JOB(jobId));
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to resume job."
            );
        }
    }
};