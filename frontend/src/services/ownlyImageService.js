import api from "@/lib/api/axios";

/**
 * Uploads an image to Ownly via the backend upload endpoint (/api/v1/file/upload)
 * and if itemId is supplied, automatically syncs the item's media to MongoDB and returns mediaArray.
 *
 * @param {string|number} activeResId - Restaurant ID
 * @param {File|string} fileOrUrl - File instance or image URL string
 * @param {string} itemName - Name of the item
 * @param {string|number} itemId - Optional Ownly item ID
 * @returns {Promise<{success: boolean, mediaArray?: Array, message?: string, url?: string}>}
 */
export const uploadOwnlyImage = async (activeResId, fileOrUrl, itemName = "item", itemId = null) => {
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

        const response = await api.post(`/api/menu/${activeResId}/ownly/upload-image`, formData, {
            headers: {
                "Content-Type": undefined,
            },
        });

        const result = response.data;
        if (result?.success && (result?.url || result?.displayUrl || result?.fileUrl)) {
            const displayUrl = result.url || result.displayUrl || result.fileUrl;
            const mediaObj = {
                tempReferenceId: `temp-${crypto.randomUUID()}`,
                url: displayUrl,
                thumbUrl: displayUrl,
                sourceUrl: typeof fileOrUrl === "string" ? fileOrUrl : (result.sourceUrl || ""),
                mediaType: "PHOTO",
                source: "OWNLY_IMAGE_UPLOAD",
                isNewlyUploaded: true,
                isUploading: false,
            };

            return {
                success: true,
                mediaArray: result.mediaArray && result.mediaArray.length > 0 ? result.mediaArray : [mediaObj],
                url: displayUrl,
                imageUrl: displayUrl,
                message: result.message,
                data: result.data,
            };
        } else {
            return {
                success: false,
                message: result?.message || "Ownly image upload failed",
            };
        }
    } catch (error) {
        console.error("Ownly Image Upload Error:", error);
        return {
            success: false,
            message: error?.response?.data?.message || error.message || "Failed to upload image to Ownly",
        };
    }
};

