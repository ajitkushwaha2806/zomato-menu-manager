let accessToken = null;
let loginPromise = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
    accessToken = token;
};

export const clearAccessToken = () => {
    accessToken = null;
};

export const getLoginPromise = () => loginPromise;

export const setLoginPromise = (promise) => {
    loginPromise = promise;
};

export const clearLoginPromise = () => {
    loginPromise = null;
};