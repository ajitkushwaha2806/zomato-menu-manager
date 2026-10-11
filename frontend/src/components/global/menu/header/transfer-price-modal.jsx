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
    Equal,
    Sparkles,
    Target
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

// Fuzzy / Exact match function, returns the best match from targetItems
const findBestMatch = (localItemName, targetItems, mode = "fuzzy", threshold = 0.4) => {
    const localNorm = normalizeString(localItemName);
    if (!localNorm) return null;

    // Check for exact normalized match first
    for (const tItem of targetItems) {
        const targetNorm = normalizeString(tItem.name);
        if (!targetNorm) continue;

        if (localNorm === targetNorm) {
            return { item: tItem, score: 0, isExact: true };
        }
    }

    // In exact mode, stop here and do not perform fuzzy matching
    if (mode === "exact") {
        return null;
    }

    let bestMatch = null;
    let bestScore = Infinity;

    for (const tItem of targetItems) {
        const targetNorm = normalizeString(tItem.name);
        if (!targetNorm) continue;

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
        return { item: bestMatch, score: bestScore, isExact: false };
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
    const [matchMode, setMatchMode] = useState("fuzzy"); // 'exact' or 'fuzzy'
    const [matchTypeFilter, setMatchTypeFilter] = useState("all"); // 'all', 'exact', 'fuzzy'
    const [uploadedFileName, setUploadedFileName] = useState("");
    const [uploadedFileItems, setUploadedFileItems] = useState([]);
    const [rawTargetItems, setRawTargetItems] = useState([]);
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

    const processTargetItems = (tItems, currentMatchMode = matchMode) => {
        if (!tItems || tItems.length === 0) {
            notification.error("No items found in the target source.");
            setIsFetching(false);
            return;
        }

        setRawTargetItems(tItems);

        const matches = [];
        const initiallySelected = new Set();

        localItems.forEach((localItem) => {
            const matchResult = findBestMatch(localItem.name, tItems, currentMatchMode, 0.4);
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
                let isNewVariantsAdded = false;

                if ((!localItem.variants || localItem.variants.length === 0) && tItem.variants && Array.isArray(tItem.variants) && tItem.variants.length > 0) {
                    newVariants = tItem.variants.map((tvg, i) => ({
                        property_id: tvg.property_id || tvg.id || tvg.group_id || `temp-${Math.random().toString(36).substring(7)}`,
                        property_name: tvg.property_name || tvg.name || tvg.group_name || `Group ${i + 1}`,
                        options: (tvg.options || []).map((tOpt, j) => ({
                            option_id: tOpt.option_id || tOpt.id || `temp-${Math.random().toString(36).substring(7)}`,
                            option_name: tOpt.option_name || tOpt.name || `Option ${j + 1}`,
                            price: cleanPrice(tOpt.price)
                        }))
                    }));
                    hasPriceDiff = true;
                    isNewVariantsAdded = true;
                    newVariants.forEach(vg => {
                        (vg.options || []).forEach(opt => {
                            variantDiffs.push({
                                name: `Added: ${opt.option_name}`,
                                oldPrice: 0,
                                newPrice: opt.price
                            });
                        });
                    });
                } else if (localItem.variants && tItem.variants && Array.isArray(tItem.variants)) {
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
                                currentMatchMode,
                                currentMatchMode === "exact" ? 0 : 0.4
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
                    localVariants: localItem.variants || [],
                    targetVariants: tItem.variants || [],
                    newVariants: newVariants,
                    variantDiffs: variantDiffs,
                    isNewVariantsAdded: isNewVariantsAdded,
                    score: matchResult.score,
                    isExact: matchResult.isExact,
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
            notification.info(
                currentMatchMode === "exact"
                    ? "No exact matching items found. Try switching to Fuzzy Match."
                    : "No matching items found between the menus."
            );
        }

        // Sort matches: Price changes first, then exact matches, then lowest match distance
        matches.sort((a, b) => {
            if (a.hasPriceDiff && !b.hasPriceDiff) return -1;
            if (!a.hasPriceDiff && b.hasPriceDiff) return 1;
            if (a.isExact && !b.isExact) return -1;
            if (!a.isExact && b.isExact) return 1;
            return a.score - b.score;
        });

        setMatchedItems(matches);
        setSelectedMatches((prev) => {
            if (prev.size === 0) return initiallySelected;
            const newSet = new Set();
            matches.forEach((m) => {
                if (prev.has(m.localId) || m.hasPriceDiff) {
                    newSet.add(m.localId);
                }
            });
            return newSet.size > 0 ? newSet : initiallySelected;
        });
        setStep(2);
    };

    const handleMatchModeChange = (newMode) => {
        setMatchMode(newMode);
        setMatchTypeFilter("all");
        if (rawTargetItems.length > 0) {
            processTargetItems(rawTargetItems, newMode);
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

            processTargetItems(tItems, matchMode);
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
            processTargetItems(parsedItems, matchMode);
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

    // Filtered items based on tab & match mode & search
    const displayedItems = useMemo(() => {
        let list = matchedItems;
        if (filterTab === "diff") {
            list = list.filter((m) => m.hasPriceDiff);
        } else if (filterTab === "same") {
            list = list.filter((m) => m.isPriceMatched);
        }

        if (matchMode === "fuzzy" && matchTypeFilter !== "all") {
            if (matchTypeFilter === "exact") {
                list = list.filter((m) => m.isExact);
            } else if (matchTypeFilter === "fuzzy") {
                list = list.filter((m) => !m.isExact);
            }
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
    }, [matchedItems, filterTab, matchMode, matchTypeFilter, searchQuery]);

    const diffCount = useMemo(() => matchedItems.filter((m) => m.hasPriceDiff).length, [matchedItems]);
    const sameCount = useMemo(() => matchedItems.filter((m) => m.isPriceMatched).length, [matchedItems]);
    const exactCount = useMemo(() => matchedItems.filter((m) => m.isExact).length, [matchedItems]);
    const fuzzyCount = useMemo(() => matchedItems.filter((m) => !m.isExact).length, [matchedItems]);

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
        setRawTargetItems([]);
        setMatchedItems([]);
        setSelectedMatches(new Set());
        setFilterTab("all");
        setMatchTypeFilter("all");
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
                                                    setRawTargetItems(parsedItems);
                                                    processTargetItems(parsedItems, matchMode);
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

                            {/* Matching Mode Option */}
                            <div className="bg-slate-50 border rounded-xl p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                                        Matching Mode
                                    </label>
                                    <span className="text-[10px] text-slate-500 font-medium">
                                        {matchMode === "exact" ? "Strict 100% dish name match" : "Smart typo & variation tolerant"}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMatchMode("exact")}
                                        className={`p-2.5 rounded-lg border text-left transition-all ${
                                            matchMode === "exact"
                                                ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 text-slate-900 shadow-xs"
                                                : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <Target className="w-3.5 h-3.5 text-emerald-600" />
                                            Exact Match Only
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                            Only matches dishes with identical names. 100% safe with zero false matches.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setMatchMode("fuzzy")}
                                        className={`p-2.5 rounded-lg border text-left transition-all ${
                                            matchMode === "fuzzy"
                                                ? "bg-white border-primary ring-2 ring-primary/20 text-slate-900 shadow-xs"
                                                : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                                            Fuzzy Match
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                            Matches identical names plus minor spelling differences and abbreviations.
                                        </p>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            {/* Match Mode Switcher & Breakdown */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-slate-50 border rounded-xl">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-700">Match Mode:</span>
                                    <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg text-xs font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => handleMatchModeChange("exact")}
                                            className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                                                matchMode === "exact"
                                                    ? "bg-white text-emerald-700 shadow-xs font-bold"
                                                    : "text-slate-600 hover:text-slate-900"
                                            }`}
                                        >
                                            <Target className="w-3.5 h-3.5 text-emerald-600" />
                                            Exact Match ({matchMode === "exact" ? matchedItems.length : exactCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMatchModeChange("fuzzy")}
                                            className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                                                matchMode === "fuzzy"
                                                    ? "bg-white text-primary shadow-xs font-bold"
                                                    : "text-slate-600 hover:text-slate-900"
                                            }`}
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                                            Fuzzy Match {matchMode === "fuzzy" ? `(${matchedItems.length})` : ""}
                                        </button>
                                    </div>
                                </div>

                                {matchMode === "fuzzy" ? (
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <span className="text-[11px] text-slate-500 font-medium">Filter type:</span>
                                        <div className="inline-flex bg-white border p-0.5 rounded-md text-[11px] font-semibold">
                                            <button
                                                type="button"
                                                onClick={() => setMatchTypeFilter("all")}
                                                className={`px-2 py-0.5 rounded transition-all ${
                                                    matchTypeFilter === "all"
                                                        ? "bg-slate-900 text-white font-bold"
                                                        : "text-slate-600 hover:text-slate-900"
                                                }`}
                                            >
                                                All ({matchedItems.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMatchTypeFilter("exact")}
                                                className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                                                    matchTypeFilter === "exact"
                                                        ? "bg-emerald-600 text-white font-bold"
                                                        : "text-emerald-700 hover:bg-emerald-50"
                                                }`}
                                            >
                                                <Check className="w-3 h-3" />
                                                Exact ({exactCount})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMatchTypeFilter("fuzzy")}
                                                className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                                                    matchTypeFilter === "fuzzy"
                                                        ? "bg-purple-600 text-white font-bold"
                                                        : "text-purple-700 hover:bg-purple-50"
                                                }`}
                                            >
                                                <Sparkles className="w-3 h-3" />
                                                Fuzzy ({fuzzyCount})
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        Strict 100% identical names only ({matchedItems.length} items)
                                    </div>
                                )}
                            </div>

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
                                <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-4 p-3 bg-slate-50 border-b font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                                    <div className="w-5"></div>
                                    <div>Current Menu (Local)</div>
                                    <div className="w-6 text-center"></div>
                                    <div>Target Menu (Source)</div>
                                </div>

                                <div className="max-h-[50vh] overflow-y-auto divide-y">
                                    {displayedItems.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-muted-foreground">
                                            No items match your filter/search.
                                        </div>
                                    ) : (
                                        displayedItems.map((match) => {
                                            const isSelected = selectedMatches.has(match.localId);
                                            const hasDiff = match.hasPriceDiff;

                                            return (
                                                <div
                                                    key={match.localId}
                                                    className={`grid grid-cols-[auto_1fr_auto_1fr] gap-4 p-4 items-start border-b transition-colors ${
                                                        hasDiff
                                                            ? isSelected
                                                                ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                                                                : "hover:bg-slate-50"
                                                            : "bg-slate-50/30 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    <div className="w-5 flex justify-center mt-2">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelection(match.localId)}
                                                        />
                                                    </div>

                                                    {/* Current Menu Column */}
                                                    <div className="min-w-0 bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-pointer" onClick={() => toggleSelection(match.localId)}>
                                                        <div className="flex justify-between items-start gap-2 mb-2">
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-800 break-words leading-tight">{match.localName}</p>
                                                                {!hasDiff && (
                                                                    <Badge variant="outline" className="mt-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] px-1.5 py-0 font-semibold flex items-center gap-1 w-fit">
                                                                        <Check className="w-2.5 h-2.5" />
                                                                        Already Matched
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0">₹{match.localPrice}</span>
                                                        </div>
                                                        {match.localVariants && match.localVariants.length > 0 ? (
                                                            <div className="space-y-1 mt-2 border-t pt-2 border-slate-100">
                                                                {match.localVariants.map(vg => (
                                                                    <div key={vg.property_name} className="text-[10px]">
                                                                        <span className="font-semibold text-slate-500">{vg.property_name}:</span>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {(vg.options || []).map(opt => (
                                                                                <span key={opt.option_name} className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                                                                    {opt.option_name} (₹{cleanPrice(opt.price)})
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] text-slate-400 italic mt-2 border-t pt-2 border-slate-100">No variants present</div>
                                                        )}
                                                    </div>

                                                    <div className="w-6 flex flex-col items-center justify-center self-stretch opacity-60">
                                                        {hasDiff ? <ArrowRight className="w-5 h-5 text-emerald-600" /> : <Equal className="w-4 h-4 text-slate-400" />}
                                                    </div>

                                                    {/* Target Menu Column */}
                                                    <div className={`min-w-0 border rounded-lg p-3 shadow-sm cursor-pointer ${
                                                        hasDiff ? (isSelected ? 'bg-emerald-50/50 border-emerald-300' : 'bg-amber-50/30 border-amber-200') : 'bg-slate-50/50 border-slate-200'
                                                    }`} onClick={() => toggleSelection(match.localId)}>
                                                        <div className="flex justify-between items-start gap-2 mb-2">
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-800 break-words leading-tight">{match.targetName}</p>
                                                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                                                    {match.isExact ? (
                                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] px-1.5 py-0 font-semibold flex items-center gap-1 w-fit">
                                                                            <Check className="w-2.5 h-2.5" />
                                                                            Exact Match
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[9px] px-1.5 py-0 font-semibold flex items-center gap-1 w-fit">
                                                                            <Sparkles className="w-2.5 h-2.5" />
                                                                            Fuzzy Match ({Math.max(1, Math.min(99, Math.round((1 - match.score) * 100)))}%)
                                                                        </Badge>
                                                                    )}
                                                                    {hasDiff && (
                                                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] px-1.5 py-0 font-bold w-fit">
                                                                            Price Diff
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${hasDiff && match.localPrice !== match.targetPrice ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                ₹{match.targetPrice}
                                                            </span>
                                                        </div>
                                                        {match.targetVariants && match.targetVariants.length > 0 ? (
                                                            <div className="space-y-1 mt-2 border-t pt-2 border-slate-200/60">
                                                                {match.targetVariants.map((vg, i) => (
                                                                    <div key={vg.property_name || vg.name || vg.group_name || i} className="text-[10px]">
                                                                        <span className="font-semibold text-slate-500">{vg.property_name || vg.name || vg.group_name || 'Options'}:</span>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {(vg.options || []).map((opt, j) => {
                                                                                const optName = opt.option_name || opt.name || `Opt ${j+1}`;
                                                                                const optPrice = cleanPrice(opt.price);
                                                                                // Highlight if price is different from local (if local had variants)
                                                                                let isDiff = false;
                                                                                if (hasDiff && match.variantDiffs?.some(d => d.name === optName)) {
                                                                                    isDiff = true;
                                                                                }
                                                                                
                                                                                return (
                                                                                    <span key={optName} className={`border px-1.5 py-0.5 rounded text-slate-700 ${isDiff ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200'}`}>
                                                                                        {optName} (₹{optPrice})
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] text-slate-400 italic mt-2 border-t pt-2 border-slate-200/60">No variants present</div>
                                                        )}
                                                        {match.isNewVariantsAdded && (
                                                            <div className="mt-2 pt-2 border-t border-purple-200/50">
                                                                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 font-bold shrink-0">
                                                                    ✨ Creating Variants
                                                                </Badge>
                                                                <p className="text-[9px] text-purple-600 font-medium mt-1 leading-tight">
                                                                    Will copy missing variants to local menu.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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
