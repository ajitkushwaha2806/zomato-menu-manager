import { useState, useRef } from "react";
import { useSelector } from "react-redux";
import useNotification from "@/store/hooks/useNotification";
import { Loader2, CheckCircle2, XCircle, UploadCloud } from "lucide-react";
import { uploadPlatformImage } from "@/services/imageService";

export default function ZomatoImageDropzone({ itemId, itemName, children, onUploadSuccess, className, onClick, overlayText = "Drop Image" }) {
    const { activeResId, activePlatform, imageUploadStatuses } = useSelector((state) => state.menu);
    const notification = useNotification();
    const fileInputRef = useRef(null);

    const [isDragOver, setIsDragOver] = useState(false);
    const [localIsUploading, setLocalIsUploading] = useState(false);
    const [localUploadStatus, setLocalUploadStatus] = useState(null);

    const globalStatus = itemId ? imageUploadStatuses?.[itemId] : null;
    const isUploading = localIsUploading || globalStatus === 'uploading';
    const uploadStatus = localUploadStatus || globalStatus;

    const processFileOrUrl = async (fileToUpload) => {
        if (!fileToUpload) return;
        setLocalIsUploading(true);
        setLocalUploadStatus(null);
        
        const result = await uploadPlatformImage(activePlatform, activeResId, fileToUpload, itemName || "Unknown Item");

        setLocalIsUploading(false);

        if (result.success) {
            setLocalUploadStatus("approved");
            onUploadSuccess(result.mediaArray);
            notification.success("Image approved & applied!", { duration: 5000 });
            setTimeout(() => setLocalUploadStatus(null), 3000);
        } else {
            setLocalUploadStatus("rejected");
            notification.error(result.message, { duration: 5000 });
            setTimeout(() => setLocalUploadStatus(null), 4000);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const urlList = e.dataTransfer.getData("text/uri-list");
        const plainText = e.dataTransfer.getData("text/plain");
        const html = e.dataTransfer.getData("text/html");
        const files = e.dataTransfer.files;

        let fileToUpload = null;
        if (files && files.length > 0) {
            fileToUpload = files[0];
        } else if (html) {
            const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (match && match[1]) {
                fileToUpload = match[1];
            }
        }
        
        // Fallback to text/uri-list or text/plain if no image tag was found in HTML
        if (!fileToUpload && (urlList || plainText)) {
            fileToUpload = urlList || plainText;
        }

        await processFileOrUrl(fileToUpload);
    };

    const handlePaste = async (e) => {
        const items = e.clipboardData?.items;
        let fileToUpload = null;

        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    fileToUpload = items[i].getAsFile();
                    break;
                }
            }
        }
        
        if (!fileToUpload) {
            const pastedText = e.clipboardData?.getData("text");
            if (pastedText && (pastedText.startsWith("http://") || pastedText.startsWith("https://") || pastedText.startsWith("data:image/"))) {
                fileToUpload = pastedText;
            }
        }

        if (fileToUpload) {
            e.preventDefault();
            await processFileOrUrl(fileToUpload);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await processFileOrUrl(file);
        }
        e.target.value = "";
    };

    const handleUploadClick = (e) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    return (
        <div
            className={`relative outline-none group/dropzone ${className} ${isDragOver ? "ring-2 ring-primary opacity-70" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onClick}
            onPaste={handlePaste}
            tabIndex={0}
        >
            {children}
            
            {/* Desktop Upload Button - visible on hover */}
            {!isUploading && (
                <button
                    onClick={handleUploadClick}
                    className="absolute bottom-2 right-2 z-40 bg-white/90 text-neutral-600 hover:text-primary hover:bg-white shadow-sm border border-neutral-200 p-1.5 rounded-md opacity-0 group-hover/dropzone:opacity-100 transition-opacity duration-200"
                    title="Upload from Desktop"
                >
                    <UploadCloud size={16} />
                </button>
            )}

            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
            />

            {isDragOver && !isUploading && (
                <div className="absolute inset-0 bg-primary/10 flex items-center justify-center backdrop-blur-[2px] transition-all z-10 pointer-events-none">
                    <span className="text-white text-xs font-semibold px-3 py-1 bg-primary rounded-full shadow-md animate-in zoom-in-95 duration-150">
                        {overlayText}
                    </span>
                </div>
            )}

            {isUploading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                    <Loader2 className="animate-spin text-primary mb-2" size={24} />
                    <span className="text-xs font-semibold text-neutral-700 tracking-wide uppercase">Validating...</span>
                </div>
            )}
            
            {uploadStatus === "approved" && !isUploading && (
                <div className="absolute top-2 right-2 z-30 bg-green-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm animate-in zoom-in duration-300 pointer-events-none">
                    <CheckCircle2 size={12} /> Approved
                </div>
            )}
            
            {uploadStatus === "rejected" && !isUploading && (
                <div className="absolute top-2 right-2 z-30 bg-red-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm animate-in zoom-in duration-300 pointer-events-none">
                    <XCircle size={12} /> Rejected
                </div>
            )}
        </div>
    );
}
