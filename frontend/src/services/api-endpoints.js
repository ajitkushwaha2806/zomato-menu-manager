export const API_ENDPOINTS = {
    ACCOUNTS: {
        ZOMATO: "/api/accounts/zomato",
        ZOMATO_PROFILE: "/api/accounts/zomato/profile",
        ZOMATO_RESTAURANTS: "/api/accounts/zomato/restaurants",
        SWIGGY: "/api/accounts/swiggy",
        SWIGGY_LOGIN: "/api/accounts/swiggy/login",
        SWIGGY_RESTAURANTS: "/api/accounts/swiggy/restaurants",
    },
    MENU: {
        ZOMATO_MENU_IMPORT: (resId) => `/api/menu/${resId}/zomato/import`,
        SWIGGY_MENU_IMPORT: (resId) => `/api/menu/${resId}/swiggy/import`,
        PETPOOJA_MENU_IMPORT: (resId) => `/api/menu/${resId}/petpooja/import`,
        GET_MENU: (resId, platform) => `/api/menu/${resId}${platform ? `?platform=${platform}` : ''}`,
        UPDATE_MENU: (resId, platform) => `/api/menu/${resId}${platform ? `?platform=${platform}` : ''}`,
        GET_FAILED_JOBS: () => `/api/backend/menu/failed-jobs`,
        RESUME_JOB: (jobId) => `/api/backend/menu/upload/${jobId}/resume`,
    },
};