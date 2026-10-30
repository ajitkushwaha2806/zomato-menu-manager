import { store } from "@/store/index";
import {
    enqueueUploadJob,
    updateUploadJobStatus,
    clearUploadQueue,
    addImage,
    setImageUploadStatus,
    setTicketImageUpdate,
} from "@/store/slice/menuSlice";
import { uploadPlatformImage } from "./imageService";
import { toast } from "sonner";

// Internal FIFO queue
const jobQueue = [];
let isWorkerRunning = false;
let autoClearTimeout = null;

/**
 * Enqueues an image upload job for asynchronous background processing.
 * Instantly updates the UI with an optimistic preview and queues the upload.
 *
 * @param {Object} params
 * @param {string|number} params.itemId - Item ID
 * @param {string} params.itemName - Item name
 * @param {File|string} params.fileOrUrl - File instance or external image URL
 * @param {boolean} [params.isTicket] - If updating a ticket
 * @param {string} [params.ticketId] - Ticket ID
 * @param {string} params.activePlatform - "petpooja" | "zomato" | "swiggy"
 * @param {string|number} params.activeResId - Restaurant ID
 * @param {Function} [params.onSuccess] - Callback on upload success
 * @param {Function} [params.onError] - Callback on upload error
 */
export const queueImageUpload = ({
    itemId,
    itemName,
    fileOrUrl,
    isTicket = false,
    ticketId = null,
    activePlatform,
    activeResId,
    onSuccess = null,
    onError = null,
}) => {
    if (!itemId || !fileOrUrl) return;

    if (autoClearTimeout) {
        clearTimeout(autoClearTimeout);
        autoClearTimeout = null;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Generate preview URL for immediate visual gratification on the card
    let previewUrl = fileOrUrl;
    if (typeof window !== "undefined" && fileOrUrl instanceof File) {
        try {
            previewUrl = URL.createObjectURL(fileOrUrl);
        } catch (e) {
            previewUrl = "";
        }
    }

    // 1. Immediately update UI with optimistic preview so user does NOT wait
    store.dispatch(
        addImage({
            itemId,
            media: [
                {
                    url: previewUrl,
                    thumbUrl: previewUrl,
                    isNewlyUploaded: true,
                    isUploading: true,
                    uploadText: "Queued...",
                },
            ],
        })
    );

    store.dispatch(
        setImageUploadStatus({
            itemId,
            status: "uploading",
            fileOrUrl,
        })
    );

    // 2. Dispatch queue state to Redux for Header progress indicator
    store.dispatch(
        enqueueUploadJob({
            id: jobId,
            itemId,
            itemName: itemName || "Item",
            fileOrUrl,
        })
    );

    // 3. Add to worker queue
    jobQueue.push({
        id: jobId,
        itemId,
        itemName: itemName || "Item",
        fileOrUrl,
        previewUrl,
        isTicket,
        ticketId,
        activePlatform,
        activeResId,
        onSuccess,
        onError,
    });

    // 4. Trigger queue worker
    processNextJob();
};

async function processNextJob() {
    if (isWorkerRunning) return;
    if (jobQueue.length === 0) {
        // Queue finished processing! Auto-clear status pill after 6 seconds of inactivity
        if (autoClearTimeout) clearTimeout(autoClearTimeout);
        autoClearTimeout = setTimeout(() => {
            const queueState = store.getState().menu?.uploadQueue;
            if (queueState && !queueState.isProcessing) {
                store.dispatch(clearUploadQueue());
            }
        }, 6000);
        return;
    }

    isWorkerRunning = true;
    const job = jobQueue.shift();

    try {
        // Update item state to "Uploading..."
        store.dispatch(
            addImage({
                itemId: job.itemId,
                media: [
                    {
                        url: job.previewUrl,
                        thumbUrl: job.previewUrl,
                        isNewlyUploaded: true,
                        isUploading: true,
                        uploadText: "Uploading...",
                    },
                ],
            })
        );

        store.dispatch(
            updateUploadJobStatus({
                id: job.id,
                itemId: job.itemId,
                status: "uploading",
            })
        );

        // Upload to Petpooja / Zomato / Swiggy
        const result = await uploadPlatformImage(
            job.activePlatform,
            job.activeResId,
            job.fileOrUrl,
            job.itemName,
            job.itemId
        );

        if (result?.success && (result?.mediaArray?.length > 0 || result?.url)) {
            const finalMedia =
                result.mediaArray && result.mediaArray.length > 0
                    ? result.mediaArray
                    : [
                          {
                              url: result.url || result.displayUrl || job.previewUrl,
                              thumbUrl: result.thumbUrl || result.url || job.previewUrl,
                              isNewlyUploaded: true,
                              isUploading: false,
                          },
                      ];

            if (job.isTicket) {
                store.dispatch(
                    setTicketImageUpdate({
                        ticketId: job.ticketId,
                        imageUrl: finalMedia[0].url,
                    })
                );
            } else {
                store.dispatch(
                    addImage({
                        itemId: job.itemId,
                        media: finalMedia,
                    })
                );
            }

            store.dispatch(
                setImageUploadStatus({
                    itemId: job.itemId,
                    status: "approved",
                })
            );

            store.dispatch(
                updateUploadJobStatus({
                    id: job.id,
                    itemId: job.itemId,
                    status: "completed",
                })
            );

            if (job.onSuccess) job.onSuccess(finalMedia);

            // Revert "approved" badge to neutral after 3 seconds
            setTimeout(() => {
                const currentStatus = store.getState().menu?.imageUploadStatuses?.[job.itemId];
                if (currentStatus === "approved" || currentStatus?.status === "approved") {
                    store.dispatch(
                        setImageUploadStatus({
                            itemId: job.itemId,
                            status: null,
                        })
                    );
                }
            }, 3000);
        } else {
            const errorMsg = result?.message || "Upload failed";
            throw new Error(errorMsg);
        }
    } catch (err) {
        console.error(`Upload failed for ${job.itemName}:`, err);
        const errorMsg = err?.response?.data?.message || err.message || "Upload failed";

        store.dispatch(
            setImageUploadStatus({
                itemId: job.itemId,
                status: "rejected",
                error: errorMsg,
                fileOrUrl: job.fileOrUrl,
            })
        );

        store.dispatch(
            updateUploadJobStatus({
                id: job.id,
                itemId: job.itemId,
                status: "failed",
                error: errorMsg,
            })
        );

        toast.error(`Failed to upload ${job.itemName}: ${errorMsg}`);
        if (job.onError) job.onError(err);
    } finally {
        isWorkerRunning = false;
        // Schedule next job with 200ms breathing room for network & session stability
        setTimeout(() => {
            processNextJob();
        }, 200);
    }
}

