import { uploadZomatoImage } from "./zomatoImageService";
import { uploadSwiggyImage } from "./swiggyImageService";
import { uploadPetpoojaImage } from "./petpoojaImageService";
import { uploadOwnlyImage } from "./ownlyImageService";

export const uploadPlatformImage = async (activePlatform, activeResId, fileOrUrl, itemName = "Unknown Item", itemId = null) => {
    if (activePlatform === "petpooja") {
        return await uploadPetpoojaImage(activeResId, fileOrUrl, itemName, itemId);
    } else if (activePlatform === "ownly") {
        return await uploadOwnlyImage(activeResId, fileOrUrl, itemName, itemId);
    } else if (activePlatform === "swiggy") {
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
