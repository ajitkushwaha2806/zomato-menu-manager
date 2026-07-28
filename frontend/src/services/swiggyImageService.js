import api from "@/lib/api/axios";

export const uploadSwiggyImage = async (activeResId, fileOrUrl, itemName) => {
    try {
        const formData = new FormData();
        if (typeof fileOrUrl === 'string') {
            formData.append("imageUrl", fileOrUrl);
        } else {
            formData.append("image", fileOrUrl);
        }
        formData.append("itemName", itemName);

        const response = await api.post(`/api/menu/${activeResId}/swiggy/items/image`, formData, {
            headers: {
                "Content-Type": undefined,
            },
        });
        
        return response.data;
    } catch (error) {
        console.error("Swiggy Image Upload Error:", error);
        throw error;
    }
};
