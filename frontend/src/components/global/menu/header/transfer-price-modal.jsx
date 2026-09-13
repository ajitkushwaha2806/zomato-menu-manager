"use client";

import React, { useState, useMemo, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Loader2,
    ArrowRight,
    CheckCircle2,
    Check,
    Search,
    UploadCloud,
    FileText,
    Store,
    Layers,
    Equal
} from "lucide-react";
import { MenuService } from "@/services/menu";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Helper to normalize strings for comparison
const normalizeString = (str) => {
    return (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
};

// Fuzzy match function, returns the best match from targetItems
const findBestMatch = (localItemName, targetItems, threshold = 0.4) => {
    const localNorm = normalizeString(localItemName);
    if (!localNorm) return null;

    let bestMatch = null;
    let bestScore = Infinity;

    for (const tItem of targetItems) {
        const targetNorm = normalizeString(tItem.name);
        if (!targetNorm) continue;

        if (localNorm === targetNorm) {
            return { item: tItem, score: 0 };
        }

        const distance = levenshteinDistance(localNorm, targetNorm);
        const maxLen = Math.max(localNorm.length, targetNorm.length);
        let score = distance / maxLen;

        if (targetNorm.includes(localNorm) || localNorm.includes(targetNorm)) {
            score = score * 0.3;
        }

        if (score < bestScore) {
            bestScore = score;
            bestMatch = tItem;
        }
    }

    if (bestScore <= threshold) {
        return { item: bestMatch, score: bestScore };
    }

    return null;
};

function cleanPrice(priceVal) {
    if (typeof priceVal === "number") return priceVal;
    if (!priceVal) return 0;
    const cleaned = String(priceVal).replace(/[^\d.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

// Simple CSV parser supporting multiline quotes
function parseCSVToItems(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const nameIdx = header.findIndex((h) => h.includes("item") || h.includes("name") || h.includes("title") || h.includes("dish"));
    const priceIdx = header.findIndex((h) => h.includes("price") || h.includes("rate") || h.includes("cost") || h.includes("amount"));

    const items = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        const name = parts[nameIdx >= 0 ? nameIdx : 0]?.trim();
        const price = cleanPrice(parts[priceIdx >= 0 ? priceIdx : 1]);
        if (name) {
            items.push({ name, base_price: price, variants: [] });
        }
    }
    return items;
}

export default function TransferPriceModal({ isOpen, onClose }) {
    const [step, setStep] = useState(1);
    const [sourceType, setSourceType] = useState("restaurant"); // 'restaurant' or 'file'
    const [targetResId, setTargetResId] = useState("");
    const [targetPlatform, setTargetPlatform] = useState("swiggy");
    const [uploadedFileName, setUploadedFileName] = useState("");
    const [uploadedFileItems, setUploadedFileItems] = useState([]);
    const [isFetching, setIsFetching] = useState(false);

    const [matchedItems, setMatchedItems] = useState([]);
    const [selectedMatches, setSelectedMatches] = useState(new Set());
    const [filterTab, setFilterTab] = useState("all"); // 'all', 'diff', 'same'
    const [searchQuery, setSearchQuery] = useState("");

    const fileInputRef = useRef(null);

    const { menuData, updateItem } = useMenu();
    const notification = useNotification();

    // Flatten local menu data
    const localItems = useMemo(() => {
        const items = [];
        (menuData || []).forEach((cat) => {
            if (cat.status === "delete" || cat.status === "deleted") return;
            (cat.sub_category || []).forEach((sub) => {
                if (sub.status === "delete" || sub.status === "deleted") return;
                (sub.items || []).forEach((item) => {
                    if (item.status === "delete" || item.status === "deleted") return;
                    items.push({
                        ...item,
                        categoryName: cat.name,
                        subCategoryName: sub.name,
                    });
                });
            });
        });
        return items;
    }, [menuData]);

    const processTargetItems = (tItems) => {
        if (tItems.length === 0) {
            notification.error("No items found in the target source.");
            setIsFetching(false);
            return;
        }

        const matches = [];
        const initiallySelected = new Set();

        localItems.forEach((localItem) => {
            const matchResult = findBestMatch(localItem.name, tItems, 0.4);
            if (matchResult) {
                const tItem = matchResult.item;

                let hasPriceDiff = false;
                const localBasePrice = cleanPrice(localItem.base_price || localItem.price || 0);
                let newBasePrice = localBasePrice;

                if (
                    tItem.base_price !== undefined &&
                    tItem.base_price !== null &&
                    cleanPrice(tItem.base_price) !== localBasePrice
                ) {
                    hasPriceDiff = true;
                    newBasePrice = cleanPrice(tItem.base_price);
                } else if (
                    tItem.price !== undefined &&
                    tItem.price !== null &&
                    cleanPrice(tItem.price) !== localBasePrice
                ) {
                    hasPriceDiff = true;
                    newBasePrice = cleanPrice(tItem.price);
                }

                let newVariants = localItem.variants
                    ? JSON.parse(JSON.stringify(localItem.variants))
                    : [];
                let variantDiffs = [];

                if (localItem.variants && tItem.variants && Array.isArray(tItem.variants)) {
                    let tOptions = [];
                    tItem.variants.forEach((tvg) => {
                        (tvg.options || []).forEach((tOpt) => {
                            tOptions.push({
                                name: tOpt.option_name || tOpt.name || "",
                                price: cleanPrice(tOpt.price),
                                item: tOpt,
                            });
                        });
                    });

                    newVariants.forEach((vg, gIdx) => {
                        if (!vg.options) return;
                        vg.options.forEach((opt, oIdx) => {
                            const optName = opt.option_name || opt.name || "";
                            if (!optName) return;

                            const tOptMatch = findBestMatch(
                                optName,
                                tOptions.map((t) => ({ ...t, name: t.name })),
                                0.4
                            );
                            if (tOptMatch) {
                                const tOpt = tOptMatch.item;
                                const localOptPrice = cleanPrice(opt.price);
                                const targetOptPrice = cleanPrice(tOpt.price);
                                if (targetOptPrice !== localOptPrice) {
                                    hasPriceDiff = true;
                                    variantDiffs.push({
                                        name: optName,
                                        oldPrice: localOptPrice,
                                        newPrice: targetOptPrice,
                                    });
                                    newVariants[gIdx].options[oIdx].price = targetOptPrice;
                                }
                            }
                        });
                    });
                }

                // Push match whether price is different OR already matched!
                matches.push({
                    localId: localItem.id,
                    localName: localItem.name,
                    categoryName: localItem.categoryName,
                    subCategoryName: localItem.subCategoryName,
                    localPrice: localBasePrice,
                    targetName: tItem.name,
                    targetPrice: newBasePrice,
                    newVariants: newVariants,
                    variantDiffs: variantDiffs,
                    score: matchResult.score,
                    hasPriceDiff: hasPriceDiff,
                    isPriceMatched: !hasPriceDiff, // true when price is identical
                });

                // Auto-select items that actually have price differences
                if (hasPriceDiff) {
                    initiallySelected.add(localItem.id);
                }
            }
        });

        if (matches.length === 0) {
            notification.info("No matching items found between the menus.");
        } else {
            // Sort matches: Price changes first, then lowest match distance
            matches.sort((a, b) => {
                if (a.hasPriceDiff && !b.hasPriceDiff) return -1;
                if (!a.hasPriceDiff && b.hasPriceDiff) return 1;
                return a.score - b.score;
            });
            setMatchedItems(matches);
            setSelectedMatches(initiallySelected);
            setStep(2);
        }
    };

    const handleFetch = async () => {
        if (!targetResId.trim()) {
            notification.error("Please enter a Target Restaurant ID.");
            return;
        }

        setIsFetching(true);
        try {
            const data = await MenuService.getMenu(targetResId.trim(), targetPlatform);

            const tItems = [];
            let menuArray = [];
            if (Array.isArray(data)) {
                menuArray = data;
            } else if (data && typeof data === "object") {
                menuArray = data.menu || data.data || data.categories || [];
            }

            menuArray.forEach((cat) => {
                (cat.sub_category || []).forEach((sub) => {
                    (sub.items || []).forEach((item) => {
                        tItems.push(item);
                    });
                });
            });

            processTargetItems(tItems);
        } catch (error) {
            console.error("Fetch target menu error:", error);
            notification.error(
                error?.response?.data?.message || error.message || "Failed to fetch target menu"
            );
        } finally {
            setIsFetching(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFileName(file.name);
        setIsFetching(true);

        try {
            const text = await file.text();
            let parsedItems = [];

            if (file.name.endsWith(".json")) {
                let json = JSON.parse(text);
                if (Array.isArray(json)) {
                    parsedItems = json;
                } else if (json.menu && Array.isArray(json.menu)) {
                    json.menu.forEach((cat) => {
                        (cat.sub_category || []).forEach((sub) => {
                            (sub.items || []).forEach((item) => parsedItems.push(item));
                        });
                    });
                } else if (json.chain_outputs?.normalized_menu?.category) {
                    json.chain_outputs.normalized_menu.category.forEach((cat) => {
                        (cat.sub_category || []).forEach((sub) => {
                            (sub.items || []).forEach((item) => parsedItems.push(item));
                        });
                    });
                } else if (json.chain_outputs?.merged_items?.items) {
                    parsedItems = json.chain_outputs.merged_items.items;
                } else if (json.items && Array.isArray(json.items)) {
                    parsedItems = json.items;
                }
            } else if (file.name.endsWith(".csv")) {
                parsedItems = parseCSVToItems(text);
            } else {
                // Try parsing JSON first, else CSV
                try {
                    const json = JSON.parse(text);
                    if (Array.isArray(json)) parsedItems = json;
                } catch {
                    parsedItems = parseCSVToItems(text);
                }
            }

            setUploadedFileItems(parsedItems);
            processTargetItems(parsedItems);
        } catch (err) {
            console.error("Error reading file:", err);
            notification.error("Failed to parse file. Please upload a valid JSON or CSV menu file.");
        } finally {
            setIsFetching(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const toggleSelection = (localId) => {
        const newSelected = new Set(selectedMatches);
        if (newSelected.has(localId)) {
            newSelected.delete(localId);
        } else {
            newSelected.add(localId);
        }
        setSelectedMatches(newSelected);
    };

    // Filtered items based on tab & search
    const displayedItems = useMemo(() => {
        let list = matchedItems;
        if (filterTab === "diff") {
            list = list.filter((m) => m.hasPriceDiff);
        } else if (filterTab === "same") {
            list = list.filter((m) => m.isPriceMatched);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(
                (m) =>
                    m.localName?.toLowerCase().includes(q) ||
                    m.targetName?.toLowerCase().includes(q) ||
                    m.categoryName?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [matchedItems, filterTab, searchQuery]);

    const diffCount = useMemo(() => matchedItems.filter((m) => m.hasPriceDiff).length, [matchedItems]);
    const sameCount = useMemo(() => matchedItems.filter((m) => m.isPriceMatched).length, [matchedItems]);

    const handleSelectAllDisplayed = () => {
        const displayedIds = displayedItems.map((m) => m.localId);
        const allDisplayedSelected = displayedIds.every((id) => selectedMatches.has(id));

        const newSelected = new Set(selectedMatches);
        if (allDisplayedSelected) {
            displayedIds.forEach((id) => newSelected.delete(id));
        } else {
            displayedIds.forEach((id) => newSelected.add(id));
        }
        setSelectedMatches(newSelected);
    };

    const handleApply = () => {
        let updateCount = 0;
        matchedItems.forEach((match) => {
            if (selectedMatches.has(match.localId)) {
                let updates = { base_price: match.targetPrice };
                if (match.newVariants && match.newVariants.length > 0) {
                    updates.variants = match.newVariants;
                }

                updateItem({
                    itemId: match.localId,
                    updates: updates,
                });
                updateCount++;
            }
        });

        notification.success(`Successfully updated prices for ${updateCount} items.`);
        handleClose();
    };

    const handleClose = () => {
        setStep(1);
        setTargetResId("");
        setUploadedFileName("");
        setUploadedFileItems([]);
        setMatchedItems([]);
        setSelectedMatches(new Set());
        setFilterTab("all");
        setSearchQuery("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-5 pb-3 border-b bg-slate-50/50">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <Layers className="w-5 h-5 text-primary" />
                        Transfer Prices
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {step === 1
                            ? "Fetch a menu from another restaurant or upload a menu file (JSON/CSV) to match and transfer prices."
                            : "Preview matched items, view price differences, inspect already-matched items, and choose which prices to apply."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-5">
                    {step === 1 && (
                        <div className="space-y-5">
                            {/* Source Selection Tabs */}
                            <div className="flex bg-slate-100 p-1 rounded-xl border text-xs font-bold">
                                <button
                                    type="button"
                                    onClick={() => setSourceType("restaurant")}
                                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                                        sourceType === "restaurant"
                                            ? "bg-white text-slate-900 shadow-sm font-bold"
                                            : "text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    <Store className="w-4 h-4" />
                                    From Restaurant ID
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSourceType("file")}
                                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                                        sourceType === "file"
                                            ? "bg-white text-slate-900 shadow-sm font-bold"
                                            : "text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    <FileText className="w-4 h-4" />
                                    From Menu File (JSON / CSV)
                                </button>
                            </div>

                            {sourceType === "restaurant" ? (
                                <div className="space-y-4 bg-white border p-4 rounded-xl">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Target Platform</label>
                                        <div className="flex gap-2">
                                            {["swiggy", "zomato", "petpooja"].map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setTargetPlatform(p)}
                                                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold capitalize transition-all ${
                                                        targetPlatform === p
                                                            ? p === "swiggy"
                                                                ? "bg-[#fc8019] text-white border-[#fc8019]"
                                                                : p === "zomato"
                                                                ? "bg-[#e23744] text-white border-[#e23744]"
                                                                : "bg-emerald-600 text-white border-emerald-600"
                                                            : "bg-white text-slate-700 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Target Restaurant ID</label>
                                        <Input
                                            placeholder="e.g. 21047451 or 1418205"
                                            value={targetResId}
                                            onChange={(e) => setTargetResId(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleFetch();
                                            }}
                                            className="font-mono text-sm h-10"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-slate-300 hover:border-primary/60 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-white"
                                    >
                                        <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                                        <p className="text-sm font-bold text-slate-700">
                                            {uploadedFileName ? uploadedFileName : "Click to select or drop a Menu JSON / CSV file"}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Supports full menu exports, test_db.json, output.json, or price CSV files.
                                        </p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".json, .csv, application/json, text/csv"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-px bg-slate-200" />
                                        <span className="text-xs font-bold text-slate-400 uppercase">or paste JSON</span>
                                        <div className="flex-1 h-px bg-slate-200" />
                                    </div>

                                    <div className="space-y-2">
                                        <textarea
                                            placeholder='Paste your menu JSON here...&#10;&#10;e.g. [{"name": "Paneer Tikka", "base_price": 249, ...}]'
                                            className="w-full h-32 p-3 border rounded-xl text-xs font-mono bg-slate-50/50 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 placeholder:text-slate-400"
                                            onChange={(e) => {
                                                // Store the raw text for the compare button
                                                e.target.dataset.jsonText = e.target.value;
                                            }}
                                            id="paste-json-textarea"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="w-full text-xs font-bold h-8"
                                            disabled={isFetching}
                                            onClick={() => {
                                                const textarea = document.getElementById("paste-json-textarea");
                                                const text = textarea?.value?.trim();
                                                if (!text) {
                                                    notification.error("Please paste JSON content first.");
                                                    return;
                                                }
                                                setIsFetching(true);
                                                try {
                                                    let parsedItems = [];
                                                    let json = JSON.parse(text);

                                                    if (Array.isArray(json)) {
                                                        // Check if it's a flat array of items or a menu structure
                                                        if (json[0]?.sub_category || json[0]?.items) {
                                                            // It's a menu category array
                                                            json.forEach((cat) => {
                                                                (cat.sub_category || []).forEach((sub) => {
                                                                    (sub.items || []).forEach((item) => parsedItems.push(item));
                                                                });
                                                                // Also check direct items
                                                                (cat.items || []).forEach((item) => parsedItems.push(item));
                                                            });
                                                        } else {
                                                            parsedItems = json;
                                                        }
                                                    } else if (json.menu && Array.isArray(json.menu)) {
                                                        json.menu.forEach((cat) => {
                                                            (cat.sub_category || []).forEach((sub) => {
                                                                (sub.items || []).forEach((item) => parsedItems.push(item));
                                                            });
                                                        });
                                                    } else if (json.chain_outputs?.normalized_menu?.category) {
                                                        json.chain_outputs.normalized_menu.category.forEach((cat) => {
                                                            (cat.sub_category || []).forEach((sub) => {
                                                                (sub.items || []).forEach((item) => parsedItems.push(item));
                                                            });
                                                        });
                                                    } else if (json.chain_outputs?.merged_items?.items) {
                                                        parsedItems = json.chain_outputs.merged_items.items;
                                                    } else if (json.items && Array.isArray(json.items)) {
                                                        parsedItems = json.items;
                                                    } else if (json.categories && Array.isArray(json.categories)) {
                                                        json.categories.forEach((cat) => {
                                                            (cat.sub_category || []).forEach((sub) => {
                                                                (sub.items || []).forEach((item) => parsedItems.push(item));
                                                            });
                                                        });
                                                    }

                                                    setUploadedFileName("Pasted JSON");
                                                    setUploadedFileItems(parsedItems);
                                                    processTargetItems(parsedItems);
                                                } catch (err) {
                                                    console.error("JSON parse error:", err);
                                                    notification.error("Invalid JSON. Please check the format and try again.");
                                                } finally {
                                                    setIsFetching(false);
                                                }
                                            }}
                                        >
                                            {isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                            Parse & Compare Pasted JSON
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            {/* Summary Stats & Filter Tabs */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                {/* Filter Tabs */}
                                <div className="flex items-center bg-slate-100 p-1 rounded-lg border text-xs font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("all")}
                                        className={`px-3 py-1.5 rounded-md transition-all ${
                                            filterTab === "all"
                                                ? "bg-white text-foreground shadow-sm font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        All Matched ({matchedItems.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("diff")}
                                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                                            filterTab === "diff"
                                                ? "bg-white text-emerald-700 shadow-sm font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                        Price Changes ({diffCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("same")}
                                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                                            filterTab === "same"
                                                ? "bg-white text-slate-800 shadow-sm font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <Equal className="w-3 h-3 text-slate-400" />
                                        Already Matched ({sameCount})
                                    </button>
                                </div>

                                {/* Selection Counter and Select All */}
                                <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                                    <span className="font-semibold text-slate-600">
                                        <strong>{selectedMatches.size}</strong> of {matchedItems.length} selected
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSelectAllDisplayed}
                                        className="h-7 text-xs font-semibold"
                                    >
                                        {displayedItems.length > 0 &&
                                        displayedItems.every((m) => selectedMatches.has(m.localId))
                                            ? "Deselect Filtered"
                                            : "Select Filtered"}
                                    </Button>
                                </div>
                            </div>

                            {/* Search bar inside modal */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search matched items by name or category (e.g. aloo)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-xs bg-slate-50/50"
                                />
                            </div>

                            {/* Table of Matched Items */}
                            <div className="border rounded-xl overflow-hidden bg-white shadow-2xs">
                                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 p-3 bg-slate-50 border-b font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                                    <div className="w-5"></div>
                                    <div>Item</div>
                                    <div className="w-20 text-right">Current</div>
                                    <div className="w-6 text-center"></div>
                                    <div className="w-24 text-right">Target</div>
                                </div>

                                <div className="max-h-[46vh] overflow-y-auto divide-y">
                                    {displayedItems.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-muted-foreground">
                                            No items match your filter/search.
                                        </div>
                                    ) : (
                                        displayedItems.map((match) => {
                                            const isSelected = selectedMatches.has(match.localId);
                                            const hasDiff = match.hasPriceDiff;

                                            return (
                                                <label
                                                    key={match.localId}
                                                    className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 p-3 items-center cursor-pointer transition-colors ${
                                                        hasDiff
                                                            ? isSelected
                                                                ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                                                                : "hover:bg-slate-50"
                                                            : "bg-slate-50/30 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    <div className="w-5 flex justify-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelection(match.localId)}
                                                        />
                                                    </div>

                                                    <div className="min-w-0 pr-2">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-slate-800 truncate" title={match.localName}>
                                                                {match.localName}
                                                            </p>
                                                            {/* Status Badge */}
                                                            {hasDiff ? (
                                                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 font-bold shrink-0">
                                                                    Price Diff
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 font-semibold shrink-0 flex items-center gap-1">
                                                                    <Check className="w-2.5 h-2.5" />
                                                                    Already Matched
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        {match.score > 0 && (
                                                            <p className="text-[11px] text-slate-400 truncate mt-0.5" title={match.targetName}>
                                                                Target item: {match.targetName}
                                                            </p>
                                                        )}

                                                        {match.variantDiffs && match.variantDiffs.length > 0 && (
                                                            <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                                                                + {match.variantDiffs.length} variant price update(s)
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="w-20 text-right text-xs font-semibold text-slate-500">
                                                        ₹{match.localPrice}
                                                    </div>

                                                    <div className="w-6 flex justify-center text-slate-400">
                                                        {hasDiff ? (
                                                            <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                                                        ) : (
                                                            <Equal className="w-3.5 h-3.5 text-slate-300" />
                                                        )}
                                                    </div>

                                                    <div className="w-24 text-right text-xs flex flex-col items-end">
                                                        <span className={`font-bold ${hasDiff ? "text-emerald-700 text-sm" : "text-slate-600"}`}>
                                                            ₹{match.targetPrice}
                                                        </span>
                                                    </div>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <Button variant="outline" size="sm" onClick={handleClose}>
                        Cancel
                    </Button>
                    {step === 1 ? (
                        <Button
                            size="sm"
                            onClick={handleFetch}
                            disabled={isFetching || (sourceType === "restaurant" && !targetResId.trim())}
                            className="bg-primary text-white font-bold gap-2 shadow-sm"
                        >
                            {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                            {sourceType === "restaurant" ? "Fetch Menu & Compare" : "Compare File"}
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStep(1)}
                            >
                                Back
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleApply}
                                disabled={selectedMatches.size === 0}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                Apply Prices ({selectedMatches.size})
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
