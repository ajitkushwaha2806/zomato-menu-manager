import { uploadZomatoImage } from "./zomatoImageService";
import { uploadSwiggyImage } from "./swiggyImageService";

export const uploadPlatformImage = async (activePlatform, activeResId, fileOrUrl, itemName = "Unknown Item") => {
    if (activePlatform === "swiggy") {
        try {
            const uploadRes = await uploadSwiggyImage(activeResId, fileOrUrl, itemName);
            if (uploadRes.success && uploadRes.file_url) {
                return {
                    success: true,
                    mediaArray: [{
                        mediaId: uploadRes.stableDiffusion?.data?.image_id || null,
                        url: uploadRes.file_url,
                        mediaType: "PHOTO",
                        source: "SWIGGY_IMAGE_UPLOAD",
                        isNewlyUploaded: true,
                        isUploading: false
                    }]
                };
            } else {
                return { success: false, message: uploadRes.message || "Swiggy upload failed" };
            }
        } catch (err) {
            return { success: false, message: err?.response?.data?.message || err.message || "Swiggy upload failed" };
        }
    } else {
        return await uploadZomatoImage(activeResId, fileOrUrl);
    }
};
