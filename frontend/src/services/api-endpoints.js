export const API_ENDPOINTS = {
    AUTH: {
        PROFILE: "/api/profile",
        RESTAURANTS: "/api/restaurants"
    },
    MENU: {
        ZOMATO_MENU_IMPORT: (resId) => `/api/menu/${resId}/zomato/import`,
        SWIGGY_MENU_IMPORT: (resId) => `/api/menu/${resId}/swiggy/import`,
        GET_MENU: (resId, platform) => `/api/menu/${resId}${platform ? `?platform=${platform}` : ''}`,
        UPDATE_MENU: (resId, platform) => `/api/menu/${resId}${platform ? `?platform=${platform}` : ''}`,
    },
};