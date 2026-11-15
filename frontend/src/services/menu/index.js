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

    async syncPetpoojaMenu(resId, queryParams = "") {
        try {
            const query = queryParams ? (queryParams.startsWith("?") ? queryParams : `?${queryParams}`) : "";
            const { data } = await api.get(`${API_ENDPOINTS.MENU.PETPOOJA_MENU_IMPORT(resId)}${query}`);
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },

    async syncOwnlyMenu(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.OWNLY_MENU_IMPORT(resId));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Something went wrong."
            );
        }
    },

    async updateOwnlyItem(resId, itemId, payload) {
        try {
            const { data } = await api.put(API_ENDPOINTS.MENU.OWNLY_ITEM_UPDATE(resId, itemId), payload);
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to update Ownly item."
            );
        }
    },

    async getPetpoojaSession(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.PETPOOJA_SESSION(resId));
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to fetch Petpooja session details."
            );
        }
    },

    async getPetpoojaIntegrationOutlets(resId) {
        try {
            const { data } = await api.get(API_ENDPOINTS.MENU.PETPOOJA_INTEGRATION_OUTLETS(resId));
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to fetch Petpooja integration outlets."
            );
        }
    },

    async switchPetpoojaPlatform(resId, payload) {
        try {
            const { data } = await api.post(API_ENDPOINTS.MENU.PETPOOJA_SESSION(resId), payload);
            return data?.data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to switch Petpooja platform."
            );
        }
    },

    async triggerPetpoojaPublish(resId, payload = {}) {
        try {
            const { data } = await api.post(API_ENDPOINTS.MENU.PETPOOJA_PUBLISH(resId), payload);
            return data;
        } catch (err) {
            throw new Error(
                err.response?.data?.message ||
                err.message ||
                "Failed to trigger menu publish on Petpooja."
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