"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import {
    Cloud,
    Folder,
    Search,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    ArrowRight,
    Info,
    ExternalLink,
    FolderCheck
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import useNotification from "@/store/hooks/useNotification";
import { uploadPlatformImage } from "@/services/imageService";
import {
    matchMenuWithDriveFiles,
    fetchDriveFileAsFile,
    getDriveThumbnailUrl
} from "@/services/driveMatchService";

export default function GoogleDriveImportModal({
    isOpen,
    onClose,
    allItems = [],
    updateItem,
    activeResId,
    activePlatform,
}) {
    const notify = useNotification();

    // Auth & Drive state
    const [accessToken, setAccessToken] = useState(null);
    const [folderUrl, setFolderUrl] = useState("");
    const [includeSubfolders, setIncludeSubfolders] = useState(true);

    const missingCount = useMemo(() => allItems.filter(item => !item.media || item.media.length === 0).length, [allItems]);
    const [targetMode, setTargetMode] = useState(missingCount > 0 ? "missing_only" : "all");
    const [strictness, setStrictness] = useState("0.80"); // 0.90, 0.80, 0.70

    // Scanning & matching state
    const [isScanning, setIsScanning] = useState(false);
    const [scannedFiles, setScannedFiles] = useState([]);
    const [matchResults, setMatchResults] = useState(null);
    const [selectedItemIds, setSelectedItemIds] = useState(new Set());
    const [activeTab, setActiveTab] = useState("matched"); // 'matched' | 'unmatched'

    // Applying state
    const [isApplying, setIsApplying] = useState(false);
    const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0, currentItemName: "" });

    // Target items
    const targetItems = useMemo(() => {
        if (targetMode === "missing_only") {
            return allItems.filter(item => !item.media || item.media.length === 0);
        }
        return allItems;
    }, [allItems, targetMode]);

    // Ensure targetMode defaults to "all" if no items are missing images when modal opens
    useEffect(() => {
        if (isOpen) {
            const count = allItems.filter(item => !item.media || item.media.length === 0).length;
            setTargetMode(count > 0 ? "missing_only" : "all");
        }
    }, [isOpen, allItems]);

    // Automatically re-run matching whenever target items, strictness, or scanned files change
    useEffect(() => {
        if (scannedFiles.length > 0) {
            const threshold = parseFloat(strictness);
            const results = matchMenuWithDriveFiles(targetItems, scannedFiles, threshold);
            setMatchResults(results);
            setSelectedItemIds(new Set(results.matched.map(m => m.item.id)));
        }
    }, [targetItems, strictness, scannedFiles]);

    // Google Login hook
    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            setAccessToken(tokenResponse.access_token);
            notify.success("Google Drive connected successfully!");
        },
        onError: (err) => {
            console.error("Google login error:", err);
            notify.error("Google sign-in failed. Please try again.");
        },
        scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
    });

    // Run matching when scanned files or strictness change
    const runMatching = (files, thresholdVal) => {
        const threshold = parseFloat(thresholdVal || strictness);
        const results = matchMenuWithDriveFiles(targetItems, files, threshold);
        setMatchResults(results);

        // Pre-select all matched items
        const initialSelected = new Set(results.matched.map(m => m.item.id));
        setSelectedItemIds(initialSelected);
    };

    // Scan Google Drive
    const handleScanDrive = async () => {
        setIsScanning(true);
        try {
            const { data } = await axios.post(`/api/menu/${activeResId}/bulk-editor/import-drive`, {
                accessToken: accessToken || null,
                folderUrl: folderUrl.trim(),
                includeSubfolders,
            });

            if (!data.success) {
                throw new Error(data.message || "Failed to scan Google Drive.");
            }

            const files = data.files || [];
            setScannedFiles(files);

            if (files.length === 0) {
                notify.warning("No image files found in the specified Drive folder. Ensure the folder has photos and permission is 'Anyone with the link can view'.");
                setMatchResults({ matched: [], unmatched: targetItems, totalItems: targetItems.length, totalDriveFiles: 0 });
                setSelectedItemIds(new Set());
            } else {
                runMatching(files, strictness);
                notify.success(`Found ${files.length} images! Matched items are ready for review.`);
            }
        } catch (error) {
            console.error("Scan Drive failed:", error);
            notify.error(error?.response?.data?.message || error.message || "Failed to scan Google Drive.");
        } finally {
            setIsScanning(false);
        }
    };

    // Handle candidate selection change for a matched item
    const handleSelectCandidate = (itemId, newFileId) => {
        if (!matchResults) return;
        const updatedMatched = matchResults.matched.map(entry => {
            if (entry.item.id === itemId) {
                const candidate = entry.allCandidates.find(c => c.file.id === newFileId);
                if (candidate) {
                    return {
                        ...entry,
                        bestFile: candidate.file,
                        score: candidate.score,
                        matchType: candidate.matchType,
                    };
                }
            }
            return entry;
        });

        setMatchResults({
            ...matchResults,
            matched: updatedMatched,
        });
    };

    // Toggle item selection
    const toggleSelectItem = (itemId) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (!matchResults) return;
        if (selectedItemIds.size === matchResults.matched.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(matchResults.matched.map(m => m.item.id)));
        }
    };

    // Apply matched images to items
    const handleApplyImages = async () => {
        if (!matchResults || selectedItemIds.size === 0) {
            notify.warning("No items selected to apply images.");
            return;
        }

        const itemsToApply = matchResults.matched.filter(m => selectedItemIds.has(m.item.id));
        setIsApplying(true);
        setApplyProgress({ current: 0, total: itemsToApply.length, currentItemName: "" });

        let appliedCount = 0;

        for (let i = 0; i < itemsToApply.length; i++) {
            const { item, bestFile } = itemsToApply[i];
            setApplyProgress({
                current: i + 1,
                total: itemsToApply.length,
                currentItemName: item.name,
            });

            // Set loading placeholder on the item card in ImageEditor
            updateItem({
                itemId: item.id,
                updates: {
                    media: [{
                        tempReferenceId: `temp-drive-${crypto.randomUUID()}`,
                        url: '',
                        isUploading: true,
                        uploadText: `Importing ${bestFile.name}...`
                    }]
                }
            });

            try {
                // 1. Download file through authenticated drive proxy as a JPEG File object
                const downloadedFile = await fetchDriveFileAsFile(
                    activeResId,
                    bestFile.id,
                    accessToken,
                    `${item.name.replace(/[^a-z0-9_-]/gi, '_')}.jpg`
                );

                // 2. Upload to platform (Zomato / Swiggy / Petpooja / Ownly)
                let finalMedia = [];
                try {
                    const uploadRes = await uploadPlatformImage(
                        activePlatform,
                        activeResId,
                        downloadedFile,
                        item.name,
                        item.originalId || item.id
                    );

                    if (uploadRes?.success && uploadRes?.mediaArray?.length > 0) {
                        finalMedia = uploadRes.mediaArray.map(m => ({
                            ...m,
                            entityId: item.originalId || item.id
                        }));
                    }
                } catch (platErr) {
                    console.warn(`Platform image upload warning for ${item.name}:`, platErr?.message);
                }

                // 3. Fallback: if platform upload is pending or direct media is preferred
                if (!finalMedia || finalMedia.length === 0) {
                    const proxyUrl = `/api/menu/${activeResId}/bulk-editor/drive-file?fileId=${bestFile.id}&accessToken=${encodeURIComponent(accessToken || '')}&format=jpeg`;
                    finalMedia = [{
                        tempReferenceId: `temp-drive-${crypto.randomUUID()}`,
                        url: proxyUrl,
                        thumbUrl: `${proxyUrl}&thumb=1`,
                        mediaType: "PHOTO",
                        mediaId: bestFile.id,
                        order: 1,
                        usageType: "FOODSHOT",
                        entityType: "CATALOGUE",
                        entityId: item.originalId || item.id,
                        fileName: bestFile.name,
                        usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                        isNewlyUploaded: true,
                        isUploading: false,
                    }];
                }

                updateItem({
                    itemId: item.id,
                    updates: { media: finalMedia }
                });

                appliedCount++;
            } catch (err) {
                console.error(`Failed to import drive image for ${item.name}:`, err);
                updateItem({
                    itemId: item.id,
                    updates: { media: [] }
                });
            }

            // Brief delay between uploads
            await new Promise(r => setTimeout(r, 400));
        }

        setIsApplying(false);
        notify.success(`Successfully imported and set images for ${appliedCount} items from Google Drive!`);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isApplying && !open && onClose()}>
            <DialogContent className="w-[96vw] sm:max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl border-neutral-200 rounded-2xl">
                {/* Header */}
                <DialogHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-neutral-100 bg-neutral-50/70">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shadow-xs shrink-0">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base sm:text-lg font-bold text-neutral-900 truncate">
                                Import Images from Google Drive
                            </DialogTitle>
                            <DialogDescription className="text-xs text-neutral-500 mt-0.5 line-clamp-1 sm:line-clamp-none">
                                Automatically scan food photos in Drive, match them with your dishes, and set them perfectly.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    {/* Connection Banner */}
                    {!accessToken ? (
                        <div className="p-3 sm:p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                    <Cloud className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-blue-950">Connect Google Drive</h4>
                                    <p className="text-[11px] text-blue-700/90 mt-0.5 leading-relaxed">
                                        Sign in to scan private drives or your personal folders. Public drives can also be scanned directly below.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => login()}
                                type="button"
                                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 px-3.5 rounded-lg shrink-0 shadow-xs transition-colors cursor-pointer text-center"
                            >
                                Connect Google Drive
                            </button>
                        </div>
                    ) : (
                        <div className="p-2.5 px-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="text-xs font-semibold text-emerald-900">
                                    Google Drive Connected
                                </span>
                            </div>
                            <button
                                onClick={() => login()}
                                type="button"
                                className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-medium cursor-pointer"
                            >
                                Switch Account
                            </button>
                        </div>
                    )}

                    {/* Filter & Source Configuration */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-neutral-200/90 shadow-xs space-y-3 sm:space-y-3.5">
                        {/* Folder Link Input */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                                <Folder className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                Google Drive Folder Link or ID
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={folderUrl}
                                    onChange={(e) => setFolderUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleScanDrive();
                                    }}
                                    placeholder="Paste Google Drive folder URL (e.g. https://drive.google.com/drive/folders/1_fLVcN...)"
                                    className="text-xs h-9 bg-neutral-50/50 border-neutral-300 focus:bg-white flex-1 min-w-0"
                                />
                                {folderUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setFolderUrl("")}
                                        className="h-9 px-2.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors shrink-0"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {/* Public Drive Information Banner */}
                            <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-lg flex items-start gap-2 text-[11px] text-amber-900 mt-2">
                                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5 min-w-0">
                                    <p className="font-semibold text-amber-950">
                                        Importing from a shared or public drive link?
                                    </p>
                                    <p className="text-amber-800 leading-relaxed">
                                        1. Ensure folder permission is set to <strong>"Anyone with the link can view"</strong>.<br />
                                        2. <em>Pro-Tip:</em> In Google Drive, open the link and click <strong>"Add shortcut to Drive"</strong> (or <strong>+</strong> icon) so it links directly to your account.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Options row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Target Items */}
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-neutral-700">Target Items</Label>
                                <Select value={targetMode} onValueChange={setTargetMode}>
                                    <SelectTrigger className="text-xs h-9 bg-neutral-50/50 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="missing_only">
                                            Only items without images ({allItems.filter(i => !i.media || i.media.length === 0).length})
                                        </SelectItem>
                                        <SelectItem value="all">
                                            All menu items ({allItems.length})
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Match Strictness */}
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-neutral-700">Match Confidence</Label>
                                <Select
                                    value={strictness}
                                    onValueChange={(val) => {
                                        setStrictness(val);
                                        if (scannedFiles.length > 0) {
                                            runMatching(scannedFiles, val);
                                        }
                                    }}
                                >
                                    <SelectTrigger className="text-xs h-9 bg-neutral-50/50 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0.90">Strict (≥ 90% Match)</SelectItem>
                                        <SelectItem value="0.80">Recommended (≥ 80% Smart Match)</SelectItem>
                                        <SelectItem value="0.70">Flexible (≥ 70% Fuzzy Match)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Subfolder and Scan Action */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                            <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeSubfolders}
                                    onChange={(e) => setIncludeSubfolders(e.target.checked)}
                                    className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer shrink-0"
                                />
                                <span>Scan inside subfolders (e.g. Starters, Main Course)</span>
                            </label>

                            <button
                                type="button"
                                onClick={handleScanDrive}
                                disabled={isScanning || isApplying}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold h-9 px-5 rounded-lg shadow transition-all cursor-pointer shrink-0"
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Scanning Google Drive...</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-3.5 h-3.5" />
                                        <span>{scannedFiles.length > 0 ? "Re-scan Drive" : "Scan Google Drive & Match"}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Match Results Review */}
                    {matchResults && (
                        <div className="space-y-3 pt-2 border-t border-neutral-200 animate-in fade-in duration-200">
                            {/* Summary bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-neutral-100/90 p-3 rounded-xl border border-neutral-200">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
                                        <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                                        <span>{matchResults.totalDriveFiles} Photos Found</span>
                                    </div>
                                    <span className="text-neutral-300 hidden sm:inline">|</span>
                                    <div className="text-xs font-semibold text-emerald-700">
                                        {matchResults.matched.length} Dishes Matched
                                    </div>
                                    {matchResults.unmatched.length > 0 && (
                                        <>
                                            <span className="text-neutral-300 hidden sm:inline">|</span>
                                            <div className="text-xs text-neutral-500">
                                                {matchResults.unmatched.length} Unmatched
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("matched")}
                                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                                            activeTab === "matched"
                                                ? "bg-white text-neutral-900 shadow-xs border border-neutral-200 font-semibold"
                                                : "text-neutral-600 hover:text-neutral-900"
                                        }`}
                                    >
                                        Matched ({matchResults.matched.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("unmatched")}
                                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                                            activeTab === "unmatched"
                                                ? "bg-white text-neutral-900 shadow-xs border border-neutral-200 font-semibold"
                                                : "text-neutral-600 hover:text-neutral-900"
                                        }`}
                                    >
                                        Unmatched ({matchResults.unmatched.length})
                                    </button>
                                </div>
                            </div>

                            {/* Matched Tab */}
                            {activeTab === "matched" && (
                                <div className="space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1">
                                        <label className="text-xs text-neutral-700 hover:text-neutral-900 font-medium flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedItemIds.size === matchResults.matched.length && matchResults.matched.length > 0}
                                                onChange={handleSelectAll}
                                                className="rounded border-neutral-300 text-teal-600 cursor-pointer"
                                            />
                                            <span>
                                                {selectedItemIds.size === matchResults.matched.length
                                                    ? "Deselect All"
                                                    : `Select All (${selectedItemIds.size}/${matchResults.matched.length})`}
                                            </span>
                                        </label>
                                        <span className="text-[11px] text-neutral-500">
                                            Toggle items to apply or switch candidate photos below
                                        </span>
                                    </div>

                                    {matchResults.matched.length === 0 ? (
                                        <div className="p-6 sm:p-8 text-center bg-white rounded-xl border border-neutral-200">
                                            <AlertCircle className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                                            <p className="text-sm font-semibold text-neutral-700">No dishes matched</p>
                                            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                                                Try lowering the match confidence to "Flexible" or ensure image filenames in Drive resemble your dish names.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 divide-y divide-neutral-100">
                                            {matchResults.matched.map(({ item, bestFile, score, matchType, allCandidates }, index) => {
                                                const isSelected = selectedItemIds.has(item.id);
                                                const thumbUrl = getDriveThumbnailUrl(activeResId, bestFile.id, accessToken || '');

                                                return (
                                                    <div
                                                        key={item._uniqueKey || `${item.id}-${index}`}
                                                        className={`p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 ${
                                                            isSelected
                                                                ? "bg-white border-neutral-200 shadow-xs"
                                                                : "bg-neutral-50/50 border-neutral-200/60 opacity-60"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleSelectItem(item.id)}
                                                                className="rounded border-neutral-300 text-teal-600 shrink-0 cursor-pointer w-4 h-4"
                                                            />

                                                            {/* Menu Dish Details */}
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-semibold text-neutral-900 truncate" title={item.name}>
                                                                    {item.name}
                                                                </p>
                                                                {item._parentCategoryName && (
                                                                    <p className="text-[10px] text-neutral-500 truncate">
                                                                        {item._parentCategoryName}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Arrow (hidden on mobile, visible on sm+) */}
                                                        <ArrowRight className="hidden sm:block w-3.5 h-3.5 text-neutral-400 shrink-0" />

                                                        {/* Matched Drive File */}
                                                        <div className="flex items-center gap-2.5 min-w-0 shrink-0 justify-between sm:justify-end pl-6 sm:pl-0">
                                                            {/* Thumbnail preview */}
                                                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 shrink-0 relative">
                                                                <img
                                                                    src={thumbUrl}
                                                                    alt={bestFile.name}
                                                                    className="w-full h-full object-cover"
                                                                    loading="lazy"
                                                                    onError={(e) => {
                                                                        e.currentTarget.style.display = "none";
                                                                    }}
                                                                />
                                                            </div>

                                                            {/* File info and candidate switcher */}
                                                            <div className="min-w-0 text-left sm:text-right max-w-[180px] sm:max-w-[220px]">
                                                                <p className="text-xs font-medium text-neutral-800 truncate" title={bestFile.name}>
                                                                    {bestFile.name}
                                                                </p>

                                                                <div className="flex items-center gap-1.5 mt-0.5 justify-start sm:justify-end flex-wrap">
                                                                    {/* Score badge */}
                                                                    <span
                                                                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border shrink-0 ${
                                                                            score >= 0.95
                                                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                                : score >= 0.85
                                                                                ? "bg-teal-50 text-teal-700 border-teal-200"
                                                                                : "bg-amber-50 text-amber-700 border-amber-200"
                                                                        }`}
                                                                    >
                                                                        {Math.round(score * 100)}% Match
                                                                    </span>

                                                                    {/* Alternative candidates picker */}
                                                                    {allCandidates.length > 1 && (
                                                                        <select
                                                                            value={bestFile.id}
                                                                            onChange={(e) => handleSelectCandidate(item.id, e.target.value)}
                                                                            className="text-[10px] bg-neutral-100 border border-neutral-200 text-neutral-700 rounded px-1 py-0.5 cursor-pointer max-w-[110px] truncate"
                                                                        >
                                                                            {allCandidates.map(c => (
                                                                                <option key={c.file.id} value={c.file.id}>
                                                                                    {c.file.name} ({Math.round(c.score * 100)}%)
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Unmatched Tab */}
                            {activeTab === "unmatched" && (
                                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                                    {matchResults.unmatched.length === 0 ? (
                                        <div className="p-6 text-center bg-white rounded-xl border border-neutral-200">
                                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                                            <p className="text-sm font-semibold text-neutral-800">All target items were matched!</p>
                                        </div>
                                    ) : (
                                        matchResults.unmatched.map((item, index) => (
                                            <div
                                                key={item._uniqueKey || `${item.id}-${index}`}
                                                className="p-2 px-3 rounded-lg bg-neutral-50 border border-neutral-200/70 flex items-center justify-between text-xs"
                                            >
                                                <span className="font-medium text-neutral-800 truncate" title={item.name}>
                                                    {item.name}
                                                </span>
                                                <span className="text-[11px] text-neutral-500">
                                                    {item._parentCategoryName || "No image in Drive"}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer with Scan / Apply Actions */}
                <DialogFooter className="p-3.5 sm:p-4 border-t border-neutral-100 bg-neutral-50/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    {isApplying ? (
                        <div className="w-full space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-medium text-neutral-700 flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 shrink-0" />
                                    Importing {applyProgress.current} of {applyProgress.total}: {applyProgress.currentItemName}
                                </span>
                                <span className="text-neutral-500">
                                    {Math.round((applyProgress.current / Math.max(1, applyProgress.total)) * 100)}%
                                </span>
                            </div>
                            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-teal-600 transition-all duration-300"
                                    style={{ width: `${(applyProgress.current / Math.max(1, applyProgress.total)) * 100}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full sm:w-auto text-xs h-9 px-4 rounded-lg border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>

                            {!matchResults ? (
                                <button
                                    type="button"
                                    onClick={handleScanDrive}
                                    disabled={isScanning}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold h-9 px-6 rounded-lg shadow transition-all cursor-pointer"
                                >
                                    {isScanning ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Scanning Google Drive...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-3.5 h-3.5" />
                                            <span>Scan Google Drive & Match</span>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleApplyImages}
                                    disabled={selectedItemIds.size === 0 || isApplying}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold h-9 px-6 rounded-lg shadow transition-all cursor-pointer"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Apply {selectedItemIds.size} Matched Images</span>
                                </button>
                            )}
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
