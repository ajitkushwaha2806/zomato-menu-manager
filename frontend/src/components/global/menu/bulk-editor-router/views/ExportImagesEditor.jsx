import { useState, useMemo, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import JSZip from "jszip";
import {
    FolderDown,
    FolderArchive,
    FolderCheck,
    Cloud,
    Loader2,
    ExternalLink,
    Image as ImageIcon,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Search,
    Sparkles,
    Settings,
    FileCheck,
    StopCircle,
    FolderPlus,
    RefreshCw,
    HardDrive,
    Info
} from "lucide-react";
import useNotification from "@/store/hooks/useNotification";
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

// Helper: Sanitize string for directory and file names across Windows and macOS
function sanitizePathSegment(name, fallback = "item") {
    if (!name || typeof name !== "string") return fallback;
    const sanitized = name
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return sanitized || fallback;
}

// Helper: Resolve image URL from item object
function resolveItemImageUrl(item) {
    if (!item) return null;
    return (
        item?.media?.[0]?.url ||
        item?.media?.[0]?.thumbUrl ||
        item.image_url ||
        (typeof item.image === "string" ? item.image : item.image?.url) ||
        null
    );
}

// Helper: Determine file extension from URL or blob type
function getFileExtension(url, blob) {
    if (blob && blob.type) {
        if (blob.type.includes("png")) return "png";
        if (blob.type.includes("webp")) return "webp";
        if (blob.type.includes("gif")) return "gif";
        if (blob.type.includes("svg")) return "svg";
        if (blob.type.includes("jpeg") || blob.type.includes("jpg")) return "jpg";
        if (blob.type.includes("avif")) return "avif";
    }
    if (url) {
        try {
            const cleanUrl = url.split("?")[0].split("#")[0];
            const ext = cleanUrl.split(".").pop()?.toLowerCase();
            if (["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"].includes(ext)) {
                return ext === "jpeg" ? "jpg" : ext;
            }
        } catch {
            // fallback below
        }
    }
    return "jpg";
}

// Helper: Fetch image with direct CORS fetch first, fallback to Next.js API proxy
async function fetchImageBlobWithFallback(url, signal) {
    try {
        const directRes = await fetch(url, { mode: "cors", signal });
        if (directRes.ok) {
            const blob = await directRes.blob();
            if (blob && blob.size > 0) return blob;
        }
    } catch {
        // Fall back to server proxy
    }

    const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl, { signal });
    if (!proxyRes.ok) {
        throw new Error(`Proxy failed (${proxyRes.status})`);
    }
    return await proxyRes.blob();
}

// Subcomponent: Google Drive Export Action
function GoogleDriveExportSection({ itemsWithImages, activeResId, notification }) {
    const [isExporting, setIsExporting] = useState(false);
    const [driveLink, setDriveLink] = useState(null);

    const performExport = async (accessToken) => {
        setIsExporting(true);
        setDriveLink(null);

        try {
            const { data } = await axios.post(`/api/menu/${activeResId}/bulk-editor/export-drive`, {
                accessToken,
                items: itemsWithImages.map(item => ({
                    id: item.id,
                    name: item.name,
                    url: resolveItemImageUrl(item),
                    category: item._parentCategoryName,
                    subcategory: item._parentSubCategoryName
                }))
            });

            if (data.success && data.link) {
                setDriveLink(data.link);
                notification.success("Images exported to Google Drive successfully!");
            } else {
                throw new Error(data.message || "Failed to get Google Drive link");
            }
        } catch (error) {
            console.error("Export to Drive failed:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to export images to Google Drive.");
        } finally {
            setIsExporting(false);
        }
    };

    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => performExport(tokenResponse.access_token),
        onError: () => notification.error("Google Login Failed"),
        scope: "https://www.googleapis.com/auth/drive.file"
    });

    if (driveLink) {
        return (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                        <p className="font-semibold text-emerald-900 text-sm">Uploaded to Google Drive!</p>
                        <p className="text-xs text-emerald-700">All images were placed in a new Drive folder.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                    <a
                        href={driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Drive Folder
                    </a>
                    <button
                        onClick={() => setDriveLink(null)}
                        className="text-xs text-neutral-500 hover:text-neutral-800 underline"
                    >
                        Export again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => login()}
            disabled={isExporting || itemsWithImages.length === 0}
            className="w-full flex items-center justify-center gap-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
            {isExporting ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading to Google Drive...
                </>
            ) : (
                <>
                    <Cloud className="w-4 h-4 text-blue-400" />
                    Sign in with Google & Export to Drive
                </>
            )}
        </button>
    );
}

export default function ExportImagesEditor({ allItems = [] }) {
    const { activeResId, restaurantName } = useSelector((state) => state.menu);
    const notification = useNotification();

    // Browser Directory Picker support detection
    const [supportsDirectoryPicker, setSupportsDirectoryPicker] = useState(false);
    useEffect(() => {
        setSupportsDirectoryPicker(typeof window !== "undefined" && "showDirectoryPicker" in window);
    }, []);

    // Configurable export settings
    const defaultFolderName = useMemo(() => {
        const cleanName = restaurantName
            ? sanitizePathSegment(restaurantName, "Menu")
            : (activeResId ? `Restaurant_${activeResId}` : "Menu");
        return `${cleanName}_Images`;
    }, [restaurantName, activeResId]);

    const [folderName, setFolderName] = useState(defaultFolderName);
    useEffect(() => {
        setFolderName(defaultFolderName);
    }, [defaultFolderName]);

    const [organizeByCategory, setOrganizeByCategory] = useState(false);
    const [includeCategoryInFilename, setIncludeCategoryInFilename] = useState(false);

    // Filter items with and without images
    const itemsWithImages = useMemo(() => {
        return allItems.filter(item => !!resolveItemImageUrl(item));
    }, [allItems]);

    const itemsWithoutImages = useMemo(() => {
        return allItems.filter(item => !resolveItemImageUrl(item));
    }, [allItems]);

    // Export execution states
    const [isExporting, setIsExporting] = useState(false);
    const [exportType, setExportType] = useState(null); // 'FOLDER' | 'ZIP'
    const [progress, setProgress] = useState({
        current: 0,
        total: 0,
        currentItemName: "",
        percent: 0,
        stage: "idle" // 'downloading' | 'packaging' | 'writing' | 'done'
    });
    const [completedSummary, setCompletedSummary] = useState(null);
    const abortRef = useRef(false);

    // Search and filter for preview list
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState("WITH_IMAGES"); // 'WITH_IMAGES' | 'ALL' | 'NO_IMAGES'

    const filteredPreviewItems = useMemo(() => {
        let list = allItems;
        if (filterMode === "WITH_IMAGES") {
            list = itemsWithImages;
        } else if (filterMode === "NO_IMAGES") {
            list = itemsWithoutImages;
        }

        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(item =>
            (item.name && item.name.toLowerCase().includes(q)) ||
            (item._parentCategoryName && item._parentCategoryName.toLowerCase().includes(q)) ||
            (item._parentSubCategoryName && item._parentSubCategoryName.toLowerCase().includes(q))
        );
    }, [allItems, itemsWithImages, itemsWithoutImages, filterMode, searchQuery]);

    // Handle Direct Folder Export via File System Access API
    const handleDirectFolderExport = async () => {
        if (!supportsDirectoryPicker) {
            notification.error("Direct folder creation is not supported by your browser. Please use 'Download ZIP Folder' instead.");
            return;
        }
        if (itemsWithImages.length === 0) {
            notification.error("No images available to export.");
            return;
        }

        let parentDirHandle;
        try {
            parentDirHandle = await window.showDirectoryPicker({
                mode: "readwrite",
                startIn: "downloads"
            });
        } catch (err) {
            if (err.name === "AbortError") return; // User closed picker
            console.error("Directory picker error:", err);
            notification.error("Could not access selected directory. Please try again or use ZIP export.");
            return;
        }

        abortRef.current = false;
        setIsExporting(true);
        setExportType("FOLDER");
        setCompletedSummary(null);

        const cleanFolder = sanitizePathSegment(folderName, "Menu_Images");

        try {
            // Create root folder on disk
            const rootDirHandle = await parentDirHandle.getDirectoryHandle(cleanFolder, { create: true });

            // Category directory handles cache if organizing by category
            const categoryDirHandles = {};
            if (organizeByCategory) {
                for (const item of itemsWithImages) {
                    const catName = sanitizePathSegment(item._parentCategoryName || "General", "General");
                    if (!categoryDirHandles[catName]) {
                        categoryDirHandles[catName] = await rootDirHandle.getDirectoryHandle(catName, { create: true });
                    }
                }
            }

            const usedFilenamesPerFolder = {};
            let successCount = 0;
            let failedCount = 0;
            const total = itemsWithImages.length;

            setProgress({
                current: 0,
                total,
                currentItemName: "Preparing export folder...",
                percent: 0,
                stage: "downloading"
            });

            // Process sequentially or with controlled small batching to prevent file system lock issues
            for (let i = 0; i < total; i++) {
                if (abortRef.current) break;

                const item = itemsWithImages[i];
                const imgUrl = resolveItemImageUrl(item);
                const itemName = item.name || `item_${item.id || i + 1}`;

                setProgress({
                    current: i + 1,
                    total,
                    currentItemName: itemName,
                    percent: Math.round(((i + 1) / total) * 100),
                    stage: "downloading"
                });

                try {
                    const blob = await fetchImageBlobWithFallback(imgUrl);
                    const ext = getFileExtension(imgUrl, blob);

                    // Build base filename
                    const catPrefix = includeCategoryInFilename && item._parentCategoryName
                        ? `${sanitizePathSegment(item._parentCategoryName)} - `
                        : "";
                    const rawBase = `${catPrefix}${sanitizePathSegment(itemName, `item_${i + 1}`)}`;

                    // Target directory handle
                    const folderKey = organizeByCategory
                        ? sanitizePathSegment(item._parentCategoryName || "General", "General")
                        : "ROOT";

                    if (!usedFilenamesPerFolder[folderKey]) {
                        usedFilenamesPerFolder[folderKey] = new Set();
                    }

                    // Avoid duplicate filename collisions
                    let finalFilename = `${rawBase}.${ext}`;
                    let counter = 1;
                    while (usedFilenamesPerFolder[folderKey].has(finalFilename.toLowerCase())) {
                        finalFilename = `${rawBase} (${counter}).${ext}`;
                        counter++;
                    }
                    usedFilenamesPerFolder[folderKey].add(finalFilename.toLowerCase());

                    // Save directly to disk
                    const targetDir = organizeByCategory
                        ? categoryDirHandles[folderKey]
                        : rootDirHandle;

                    const fileHandle = await targetDir.getFileHandle(finalFilename, { create: true });
                    const writableStream = await fileHandle.createWritable();
                    await writableStream.write(blob);
                    await writableStream.close();

                    successCount++;
                } catch (itemErr) {
                    console.error(`Failed to export image for ${itemName}:`, itemErr);
                    failedCount++;
                }
            }

            if (abortRef.current) {
                notification.info("Folder export was stopped by user.");
            } else {
                setCompletedSummary({
                    type: "FOLDER",
                    successCount,
                    failedCount,
                    folderName: cleanFolder
                });
                notification.success(`Successfully saved ${successCount} images directly into folder "${cleanFolder}"!`);
            }
        } catch (error) {
            console.error("Folder export failed:", error);
            notification.error(error.message || "Failed to write images into folder.");
        } finally {
            setIsExporting(false);
            setExportType(null);
        }
    };

    // Handle ZIP Archive Export
    const handleZipExport = async () => {
        if (itemsWithImages.length === 0) {
            notification.error("No images available to export.");
            return;
        }

        abortRef.current = false;
        setIsExporting(true);
        setExportType("ZIP");
        setCompletedSummary(null);

        const cleanFolder = sanitizePathSegment(folderName, "Menu_Images");
        const zip = new JSZip();
        const rootZipFolder = zip.folder(cleanFolder);

        const usedFilenamesPerFolder = {};
        let successCount = 0;
        let failedCount = 0;
        const total = itemsWithImages.length;

        try {
            // Concurrent downloads in batches of 5
            const concurrency = 5;
            let currentIndex = 0;

            const downloadWorker = async () => {
                while (currentIndex < total && !abortRef.current) {
                    const i = currentIndex++;
                    const item = itemsWithImages[i];
                    const imgUrl = resolveItemImageUrl(item);
                    const itemName = item.name || `item_${item.id || i + 1}`;

                    setProgress(prev => ({
                        ...prev,
                        current: i + 1,
                        total,
                        currentItemName: itemName,
                        percent: Math.round(((i + 1) / total) * 90),
                        stage: "downloading"
                    }));

                    try {
                        const blob = await fetchImageBlobWithFallback(imgUrl);
                        const ext = getFileExtension(imgUrl, blob);

                        const catPrefix = includeCategoryInFilename && item._parentCategoryName
                            ? `${sanitizePathSegment(item._parentCategoryName)} - `
                            : "";
                        const rawBase = `${catPrefix}${sanitizePathSegment(itemName, `item_${i + 1}`)}`;

                        const folderKey = organizeByCategory
                            ? sanitizePathSegment(item._parentCategoryName || "General", "General")
                            : "ROOT";

                        if (!usedFilenamesPerFolder[folderKey]) {
                            usedFilenamesPerFolder[folderKey] = new Set();
                        }

                        let finalFilename = `${rawBase}.${ext}`;
                        let counter = 1;
                        while (usedFilenamesPerFolder[folderKey].has(finalFilename.toLowerCase())) {
                            finalFilename = `${rawBase} (${counter}).${ext}`;
                            counter++;
                        }
                        usedFilenamesPerFolder[folderKey].add(finalFilename.toLowerCase());

                        if (organizeByCategory) {
                            rootZipFolder.folder(folderKey).file(finalFilename, blob);
                        } else {
                            rootZipFolder.file(finalFilename, blob);
                        }

                        successCount++;
                    } catch (err) {
                        console.error(`Failed to download ${itemName}:`, err);
                        failedCount++;
                    }
                }
            };

            const workers = Array.from(
                { length: Math.min(concurrency, total) },
                () => downloadWorker()
            );
            await Promise.all(workers);

            if (abortRef.current) {
                notification.info("Export cancelled.");
                setIsExporting(false);
                setExportType(null);
                return;
            }

            // Package ZIP file
            setProgress(prev => ({
                ...prev,
                currentItemName: "Compressing into ZIP archive...",
                stage: "packaging",
                percent: 92
            }));

            const zipBlob = await zip.generateAsync(
                { type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } },
                (meta) => {
                    setProgress(prev => ({
                        ...prev,
                        percent: 90 + Math.round((meta.percent / 100) * 10)
                    }));
                }
            );

            // Trigger file download
            const downloadUrl = URL.createObjectURL(zipBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `${cleanFolder}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);

            setCompletedSummary({
                type: "ZIP",
                successCount,
                failedCount,
                folderName: cleanFolder
            });
            notification.success(`Downloaded ${successCount} images in folder "${cleanFolder}.zip"!`);
        } catch (error) {
            console.error("ZIP export failed:", error);
            notification.error(error.message || "Failed to package ZIP archive.");
        } finally {
            setIsExporting(false);
            setExportType(null);
        }
    };

    const handleCancelExport = () => {
        abortRef.current = true;
        setProgress(prev => ({
            ...prev,
            currentItemName: "Cancelling...",
            stage: "cancelled"
        }));
    };

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/50">
            {/* Top Header */}
            <div className="bg-white border-b border-neutral-200/80 px-6 py-5 shrink-0 shadow-xs">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                <FolderDown className="w-5 h-5" />
                            </div>
                            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                                Export Menu Images to Folder
                            </h1>
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">
                            Export dish images directly to a folder on your computer or download as a ZIP archive, saved cleanly with each item's name.
                        </p>
                    </div>

                    {/* Quick Stats Badges */}
                    <div className="flex items-center gap-2 text-xs">
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                            <span><strong>{itemsWithImages.length}</strong> with images</span>
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-600 font-medium">
                            <span>{allItems.length} total items</span>
                        </div>
                        {itemsWithoutImages.length > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>{itemsWithoutImages.length} without image</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-7xl mx-auto space-y-6">

                    {/* Live Progress Banner (Active during export) */}
                    {isExporting && (
                        <div className="p-5 bg-white border border-primary/30 rounded-2xl shadow-lg ring-4 ring-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                                            {exportType === "FOLDER" ? "Writing Images to Folder..." : "Downloading & Archiving Images..."}
                                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                {progress.percent}%
                                            </span>
                                        </h3>
                                        <p className="text-xs text-neutral-500 truncate max-w-md mt-0.5">
                                            Current: <span className="font-medium text-neutral-800">{progress.currentItemName}</span> ({progress.current} of {progress.total})
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleCancelExport}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    <StopCircle className="w-3.5 h-3.5" />
                                    Cancel
                                </button>
                            </div>

                            {/* Progress Track */}
                            <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-primary h-full rounded-full transition-all duration-200"
                                    style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Completion Alert */}
                    {completedSummary && !isExporting && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 mt-0.5">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-emerald-950 text-sm">
                                        Export Completed Successfully!
                                    </h4>
                                    <p className="text-xs text-emerald-800 mt-0.5">
                                        {completedSummary.type === "FOLDER"
                                            ? `All ${completedSummary.successCount} images have been saved into folder "${completedSummary.folderName}" on your device.`
                                            : `All ${completedSummary.successCount} images have been downloaded as "${completedSummary.folderName}.zip" containing the folder.`}
                                    </p>
                                    {completedSummary.failedCount > 0 && (
                                        <p className="text-xs text-amber-700 mt-1">
                                            {completedSummary.failedCount} image(s) could not be retrieved from source.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setCompletedSummary(null)}
                                className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline shrink-0"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* Export Action Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                        {/* Card 1: Direct to Local Folder (Recommended for Desktop/Chromium/Electron) */}
                        <div className={`relative bg-white border rounded-2xl p-6 flex flex-col justify-between shadow-xs transition-all ${supportsDirectoryPicker ? 'border-primary/40 hover:border-primary hover:shadow-md' : 'border-neutral-200 opacity-90'}`}>
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                        <HardDrive className="w-6 h-6" />
                                    </div>
                                    {supportsDirectoryPicker ? (
                                        <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                            Recommended
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                                            Chrome / Edge only
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-bold text-neutral-900 text-base">
                                    Save Directly into Folder
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                                    Select any directory on your computer (e.g., Desktop or Downloads). The app creates a folder named <strong>"{folderName}"</strong> and downloads all item images directly into it with item names.
                                </p>

                                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2 text-[11px] text-neutral-600">
                                    <FolderCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                                    <span>No unzipping needed • Saves directly to disk</span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={handleDirectFolderExport}
                                    disabled={isExporting || itemsWithImages.length === 0 || !supportsDirectoryPicker}
                                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                                >
                                    {isExporting && exportType === "FOLDER" ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving to Folder...
                                        </>
                                    ) : (
                                        <>
                                            <FolderPlus className="w-4 h-4" />
                                            Select Folder & Export
                                        </>
                                    )}
                                </button>
                                {!supportsDirectoryPicker && (
                                    <p className="text-[11px] text-center text-amber-600 mt-2">
                                        Use "Download ZIP Folder" below on Safari or Firefox.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Card 2: Download ZIP Folder (Works in 100% of browsers) */}
                        <div className="bg-white border border-neutral-200 hover:border-neutral-300 rounded-2xl p-6 flex flex-col justify-between shadow-xs transition-all hover:shadow-md">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
                                        <FolderArchive className="w-6 h-6" />
                                    </div>
                                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/60 px-2.5 py-1 rounded-full">
                                        Universal
                                    </span>
                                </div>
                                <h3 className="font-bold text-neutral-900 text-base">
                                    Download as ZIP Folder
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                                    Packages all {itemsWithImages.length} images into a compressed folder archive (<strong>"{folderName}.zip"</strong>). When extracted, it becomes a folder with all item images.
                                </p>

                                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2 text-[11px] text-neutral-600">
                                    <FileCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span>Works in all browsers & operating systems</span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={handleZipExport}
                                    disabled={isExporting || itemsWithImages.length === 0}
                                    className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                                >
                                    {isExporting && exportType === "ZIP" ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creating ZIP Folder...
                                        </>
                                    ) : (
                                        <>
                                            <FolderArchive className="w-4 h-4" />
                                            Download ZIP Folder
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Card 3: Google Drive (Optional Cloud Export) */}
                        <div className="bg-white border border-neutral-200 rounded-2xl p-6 flex flex-col justify-between shadow-xs">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                                        <Cloud className="w-6 h-6" />
                                    </div>
                                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                                        Cloud
                                    </span>
                                </div>
                                <h3 className="font-bold text-neutral-900 text-base">
                                    Export to Google Drive
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                                    Uploads all images directly into a newly created folder in your personal Google Drive account.
                                </p>

                                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2 text-[11px] text-neutral-600">
                                    <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    <span>Creates a shareable Drive folder link</span>
                                </div>
                            </div>

                            <div className="mt-6">
                                {googleClientId ? (
                                    <GoogleOAuthProvider clientId={googleClientId}>
                                        <GoogleDriveExportSection
                                            itemsWithImages={itemsWithImages}
                                            activeResId={activeResId}
                                            notification={notification}
                                        />
                                    </GoogleOAuthProvider>
                                ) : (
                                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-center">
                                        <p className="text-xs text-neutral-500">
                                            Google Drive requires <code className="text-[10px] bg-neutral-200 px-1 py-0.5 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>. Use Folder or ZIP export above.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Folder & Filename Customization Settings */}
                    <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs space-y-5">
                        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                            <Settings className="w-4 h-4 text-neutral-500" />
                            <h3 className="font-bold text-neutral-800 text-sm">
                                Folder & Filename Settings
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {/* Folder Name */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-neutral-700">
                                    Folder Name
                                </label>
                                <input
                                    type="text"
                                    value={folderName}
                                    onChange={(e) => setFolderName(e.target.value)}
                                    placeholder="e.g. Menu_Images"
                                    className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                                />
                                <p className="text-[11px] text-neutral-400">
                                    Folder created on your disk or inside the ZIP.
                                </p>
                            </div>

                            {/* Subfolder Organization */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-neutral-700">
                                    Folder Organization
                                </label>
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setOrganizeByCategory(false)}
                                        className={`flex-1 text-xs py-2 px-3 rounded-lg border font-medium transition-all ${!organizeByCategory
                                            ? 'bg-primary/10 border-primary text-primary font-semibold'
                                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                                    >
                                        Single Folder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOrganizeByCategory(true)}
                                        className={`flex-1 text-xs py-2 px-3 rounded-lg border font-medium transition-all ${organizeByCategory
                                            ? 'bg-primary/10 border-primary text-primary font-semibold'
                                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                                    >
                                        Category Folders
                                    </button>
                                </div>
                                <p className="text-[11px] text-neutral-400">
                                    {organizeByCategory
                                        ? "Creates a subfolder for each category (e.g. Starters/, Desserts/)."
                                        : "Puts all item images directly into the main folder."}
                                </p>
                            </div>

                            {/* Filename prefix */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-neutral-700">
                                    Filename Structure
                                </label>
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIncludeCategoryInFilename(false)}
                                        className={`flex-1 text-xs py-2 px-3 rounded-lg border font-medium transition-all ${!includeCategoryInFilename
                                            ? 'bg-primary/10 border-primary text-primary font-semibold'
                                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                                    >
                                        Item Name only
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIncludeCategoryInFilename(true)}
                                        className={`flex-1 text-xs py-2 px-3 rounded-lg border font-medium transition-all ${includeCategoryInFilename
                                            ? 'bg-primary/10 border-primary text-primary font-semibold'
                                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                                    >
                                        Category + Name
                                    </button>
                                </div>
                                <p className="text-[11px] text-neutral-400">
                                    Example: {includeCategoryInFilename ? "Main Course - Butter Chicken.jpg" : "Butter Chicken.jpg"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Preview Table of Items */}
                    <div className="bg-white border border-neutral-200/80 rounded-2xl shadow-xs overflow-hidden">
                        {/* Table Header and Search */}
                        <div className="p-4 border-b border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-neutral-900 text-sm">
                                    Images Preview & Filenames
                                </h3>
                                <span className="text-xs bg-neutral-100 text-neutral-600 font-semibold px-2 py-0.5 rounded-full">
                                    {filteredPreviewItems.length}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Filter Tabs */}
                                <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg text-xs font-medium">
                                    <button
                                        onClick={() => setFilterMode("WITH_IMAGES")}
                                        className={`px-2.5 py-1 rounded-md transition-all ${filterMode === "WITH_IMAGES" ? "bg-white text-neutral-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}
                                    >
                                        With Images ({itemsWithImages.length})
                                    </button>
                                    <button
                                        onClick={() => setFilterMode("NO_IMAGES")}
                                        className={`px-2.5 py-1 rounded-md transition-all ${filterMode === "NO_IMAGES" ? "bg-white text-neutral-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}
                                    >
                                        Missing ({itemsWithoutImages.length})
                                    </button>
                                    <button
                                        onClick={() => setFilterMode("ALL")}
                                        className={`px-2.5 py-1 rounded-md transition-all ${filterMode === "ALL" ? "bg-white text-neutral-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}
                                    >
                                        All ({allItems.length})
                                    </button>
                                </div>

                                {/* Search Bar */}
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search item or category..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-60 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="max-h-[380px] overflow-y-auto divide-y divide-neutral-100 text-xs">
                            {filteredPreviewItems.length === 0 ? (
                                <div className="p-8 text-center text-neutral-400">
                                    No items match the current search or filter.
                                </div>
                            ) : (
                                filteredPreviewItems.map((item, idx) => {
                                    const imgUrl = resolveItemImageUrl(item);
                                    const catPrefix = includeCategoryInFilename && item._parentCategoryName
                                        ? `${sanitizePathSegment(item._parentCategoryName)} - `
                                        : "";
                                    const plannedName = `${catPrefix}${sanitizePathSegment(item.name || "item")}.jpg`;
                                    const folderPath = organizeByCategory
                                        ? `${sanitizePathSegment(item._parentCategoryName || "General")}/${plannedName}`
                                        : plannedName;

                                    return (
                                        <div
                                            key={item.id || idx}
                                            className="px-4 py-2.5 flex items-center justify-between hover:bg-neutral-50/80 transition-colors gap-4"
                                        >
                                            {/* Item Info & Thumbnail */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden shrink-0 flex items-center justify-center">
                                                    {imgUrl ? (
                                                        <img
                                                            src={imgUrl}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <ImageIcon className="w-4 h-4 text-neutral-300" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-neutral-800 truncate">
                                                        {item.name || "Untitled Item"}
                                                    </p>
                                                    <p className="text-[11px] text-neutral-400 truncate">
                                                        {item._parentCategoryName || "No Category"}
                                                        {item._parentSubCategoryName ? ` › ${item._parentSubCategoryName}` : ""}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Output File Path Preview */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                {imgUrl ? (
                                                    <div className="text-right">
                                                        <span className="font-mono text-[11px] text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                                                            {folderPath}
                                                        </span>
                                                        <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                                            Ready to export
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                        No image
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
