import api from "@/lib/api/axios";

/**
 * Uploads an image to Petpooja temporary upload API (/api/v1/uploads/temp)
 * and if itemId is supplied, automatically updates the item's image via PUT /api/v1/menu/items/{itemId}.
 * 
 * @param {string|number} activeResId - Restaurant ID
 * @param {File|string} fileOrUrl - File instance or image URL string
 * @param {string} itemName - Name of the item for naming the file
 * @param {string|number} itemId - Optional Petpooja item ID for instant image update
 * @returns {Promise<{success: boolean, mediaArray?: Array, message?: string, key?: string, url?: string, itemUpdated?: boolean}>}
 */
export const uploadPetpoojaImage = async (activeResId, fileOrUrl, itemName = "item", itemId = null) => {
    try {
        const formData = new FormData();
        if (typeof fileOrUrl === "string") {
            formData.append("imageUrl", fileOrUrl);
        } else {
            formData.append("file", fileOrUrl);
        }
        formData.append("itemName", itemName);
        if (itemId) {
            formData.append("itemId", itemId);
        }

        const response = await api.post(`/api/menu/${activeResId}/petpooja/upload-image`, formData, {
            headers: {
                "Content-Type": undefined,
            },
        });

        const result = response.data;
        if (result?.success && (result?.url || result?.displayUrl || result?.key)) {
            // Determine accessible display URL, preferring local public cache or source image over private S3 bucket
            let displayUrl = result.localUrl || result.displayUrl || result.sourceUrl;
            if (!displayUrl || displayUrl.includes("temp-uploads-live.s3")) {
                if (result.key) {
                    displayUrl = `/uploads/petpooja/${result.key}`;
                } else if (typeof fileOrUrl === "string") {
                    displayUrl = fileOrUrl;
                } else if (typeof window !== "undefined" && fileOrUrl instanceof File) {
                    try {
                        displayUrl = URL.createObjectURL(fileOrUrl);
                    } catch (e) {}
                }
            }
            if (!displayUrl) {
                displayUrl = result.url || result.imageUrl;
            }

            const mediaObj = {
                tempReferenceId: `temp-${crypto.randomUUID()}`,
                mediaId: result.key || result.data?.key || "petpooja_img",
                url: displayUrl,
                thumbUrl: displayUrl,
                sourceUrl: typeof fileOrUrl === "string" ? fileOrUrl : (result.sourceUrl || ""),
                mediaType: "PHOTO",
                source: "PETPOOJA_IMAGE_UPLOAD",
                isNewlyUploaded: true,
                isUploading: false,
                key: result.key,
            };

            if (itemId && result?.itemUpdated === false) {
                return {
                    success: false,
                    message: result.message || result.warning || "Petpooja item update rejected",
                    key: result.key,
                    url: displayUrl,
                };
            }

            return {
                success: true,
                mediaArray: [mediaObj],
                key: result.key,
                url: displayUrl,
                imageUrl: displayUrl,
                itemUpdated: result.itemUpdated,
                warning: result.warning,
                message: result.message,
                data: result.data,
            };
        } else {
            return {
                success: false,
                message: result?.message || "Petpooja image upload failed",
            };
        }
    } catch (error) {
        console.error("Petpooja Image Upload Error:", error);
        return {
            success: false,
            message: error?.response?.data?.message || error.message || "Failed to upload image to Petpooja",
        };
    }
};

/**
 * Fetches complete item details from Petpooja (/api/v1/menu/items/{itemId}).
 * 
 * @param {string|number} activeResId - Restaurant ID
 * @param {string|number} itemId - Petpooja item ID
 * @returns {Promise<{success: boolean, data?: Object, message?: string}>}
 */
export const getPetpoojaItem = async (activeResId, itemId) => {
    try {
        const response = await api.get(`/api/menu/${activeResId}/petpooja/items/${itemId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching Petpooja item details:", error);
        return {
            success: false,
            message: error?.response?.data?.message || error.message || "Failed to fetch item information",
        };
    }
};

/**
 * Updates an item directly on Petpooja (/api/v1/menu/items/{itemId}).
 * 
 * @param {string|number} activeResId - Restaurant ID
 * @param {string|number} itemId - Petpooja item ID
 * @param {Object} payload - Update payload or partial data
 * @returns {Promise<{success: boolean, data?: Object, message?: string}>}
 */
export const updatePetpoojaItem = async (activeResId, itemId, payload) => {
    try {
        const response = await api.put(`/api/menu/${activeResId}/petpooja/items/${itemId}`, payload);
        return response.data;
    } catch (error) {
        console.error("Error updating Petpooja item:", error);
        return {
            success: false,
            message: error?.response?.data?.message || error.message || "Failed to update item on Petpooja",
        };
    }
};
