"use client";

import React, { useState, useMemo } from "react";
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
import { Loader2, ArrowRight, CheckCircle2  } from "lucide-react";
import { MenuService } from "@/services/menu";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
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
const findBestMatch = (localItemName, targetItems, threshold = 0.3) => {
    const localNorm = normalizeString(localItemName);
    if (!localNorm) return null;

    let bestMatch = null;
    let bestScore = Infinity; // Lower distance is better

    for (const tItem of targetItems) {
        const targetNorm = normalizeString(tItem.name);
        if (!targetNorm) continue;
        
        // Exact normalized match is score 0
        if (localNorm === targetNorm) {
            return { item: tItem, score: 0 };
        }

        const distance = levenshteinDistance(localNorm, targetNorm);
        // Normalize distance by the max length of the two strings
        const maxLen = Math.max(localNorm.length, targetNorm.length);
        let score = distance / maxLen; // 0 = exact match, 1 = completely different

        // Substring boost: if one contains the other, give a massive boost
        if (targetNorm.includes(localNorm) || localNorm.includes(targetNorm)) {
            score = score * 0.3; // e.g. "half" (4) in "halfsize" (8) -> 0.5 * 0.3 = 0.15
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

export default function TransferPriceModal({ isOpen, onClose }) {
    const [step, setStep] = useState(1);
    const [targetResId, setTargetResId] = useState("");
    const [targetPlatform, setTargetPlatform] = useState("swiggy");
    const [isFetching, setIsFetching] = useState(false);
    
    const [matchedItems, setMatchedItems] = useState([]);
    const [selectedMatches, setSelectedMatches] = useState(new Set());
    
    const { menuData, updateItem } = useMenu();
    const notification = useNotification();

    // Flatten local menu data to easily iterate over items
    const localItems = useMemo(() => {
        const items = [];
        (menuData || []).forEach(cat => {
            if (cat.status === 'delete' || cat.status === 'deleted') return;
            (cat.sub_category || []).forEach(sub => {
                if (sub.status === 'delete' || sub.status === 'deleted') return;
                (sub.items || []).forEach(item => {
                    if (item.status === 'delete' || item.status === 'deleted') return;
                    items.push(item);
                });
            });
        });
        return items;
    }, [menuData]);

    const handleFetch = async () => {
        if (!targetResId.trim()) {
            notification.error("Please enter a Target Restaurant ID.");
            return;
        }
        
        setIsFetching(true);
        try {
            const data = await MenuService.getMenu(targetResId, targetPlatform);
            
            // Flatten target items
            const tItems = [];
            
            // Handle both Array and Object responses
            let menuArray = [];
            if (Array.isArray(data)) {
                menuArray = data;
            } else if (data && typeof data === 'object') {
                // If it's an object, it might have a 'menu' property or 'data' property
                menuArray = data.menu || data.data || data.categories || [];
            }

            menuArray.forEach(cat => {
                (cat.sub_category || []).forEach(sub => {
                    (sub.items || []).forEach(item => {
                        tItems.push(item);
                    });
                });
            });

            if (tItems.length === 0) {
                notification.error("Target menu is empty or not found.");
                setIsFetching(false);
                return;
            }

            // Find matches
            const matches = [];
            const initiallySelected = new Set();
            
            localItems.forEach(localItem => {
                const matchResult = findBestMatch(localItem.name, tItems, 0.4); // 0.4 threshold
                if (matchResult) {
                    const tItem = matchResult.item;
                    
                    let hasPriceDiff = false;
                    let newBasePrice = localItem.base_price;
                    
                    if (tItem.base_price !== undefined && 
                        tItem.base_price !== null && 
                        tItem.base_price !== localItem.base_price) {
                        hasPriceDiff = true;
                        newBasePrice = tItem.base_price;
                    }
                    
                    let newVariants = localItem.variants ? JSON.parse(JSON.stringify(localItem.variants)) : [];
                    let variantDiffs = [];
                    
                    if (localItem.variants && tItem.variants) {
                        let tOptions = [];
                        tItem.variants.forEach(tvg => {
                            (tvg.options || []).forEach(tOpt => {
                                tOptions.push({
                                    name: tOpt.option_name || tOpt.name || "",
                                    price: tOpt.price || 0,
                                    item: tOpt
                                });
                            });
                        });
                        
                        newVariants.forEach((vg, gIdx) => {
                            if (!vg.options) return;
                            vg.options.forEach((opt, oIdx) => {
                                const optName = opt.option_name || opt.name || "";
                                if (!optName) return;
                                
                                const tOptMatch = findBestMatch(optName, tOptions.map(t => ({...t, name: t.name})), 0.4);
                                if (tOptMatch) {
                                    const tOpt = tOptMatch.item;
                                    if (tOpt.price !== undefined && Number(tOpt.price) !== Number(opt.price)) {
                                        hasPriceDiff = true;
                                        variantDiffs.push({
                                            name: optName,
                                            oldPrice: opt.price || 0,
                                            newPrice: tOpt.price
                                        });
                                        newVariants[gIdx].options[oIdx].price = tOpt.price;
                                    }
                                }
                            });
                        });
                    }

                    if (hasPriceDiff) {
                        matches.push({
                            localId: localItem.id,
                            localName: localItem.name,
                            localPrice: localItem.base_price || 0,
                            targetName: tItem.name,
                            targetPrice: newBasePrice,
                            newVariants: newVariants,
                            variantDiffs: variantDiffs,
                            score: matchResult.score
                        });
                        initiallySelected.add(localItem.id);
                    }
                }
            });

            if (matches.length === 0) {
                notification.info("No price differences found between the menus.");
            } else {
                // Sort matches: Exact matches (score 0) first, then fuzzy
                matches.sort((a, b) => a.score - b.score);
                setMatchedItems(matches);
                setSelectedMatches(initiallySelected);
                setStep(2);
            }
        } catch (error) {
            console.error("Fetch target menu error:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to fetch target menu");
        } finally {
            setIsFetching(false);
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

    const handleApply = () => {
        let updateCount = 0;
        matchedItems.forEach(match => {
            if (selectedMatches.has(match.localId)) {
                let updates = { base_price: match.targetPrice };
                if (match.newVariants && match.newVariants.length > 0) {
                    updates.variants = match.newVariants;
                }
                
                updateItem({
                    itemId: match.localId,
                    updates: updates
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
        setMatchedItems([]);
        setSelectedMatches(new Set());
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Transfer Prices</DialogTitle>
                    <DialogDescription>
                        {step === 1 
                            ? "Fetch a menu from another restaurant to copy prices."
                            : "Preview matched items and select which prices to update."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Target Platform</label>
                                <div className="flex gap-2">
                                    <Button
                                        variant={targetPlatform === 'swiggy' ? 'default' : 'outline'}
                                        className={targetPlatform === 'swiggy' ? 'bg-[#fc8019]' : ''}
                                        onClick={() => setTargetPlatform('swiggy')}
                                    >
                                        Swiggy
                                    </Button>
                                    <Button
                                        variant={targetPlatform === 'zomato' ? 'default' : 'outline'}
                                        className={targetPlatform === 'zomato' ? 'bg-[#e23744]' : ''}
                                        onClick={() => setTargetPlatform('zomato')}
                                    >
                                        Zomato
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Target Restaurant ID</label>
                                <Input 
                                    placeholder="e.g. 123456" 
                                    value={targetResId}
                                    onChange={(e) => setTargetResId(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleFetch();
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-muted/30 p-2 rounded-md">
                                <span className="text-sm font-medium">{selectedMatches.size} of {matchedItems.length} selected</span>
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                        if (selectedMatches.size === matchedItems.length) {
                                            setSelectedMatches(new Set());
                                        } else {
                                            setSelectedMatches(new Set(matchedItems.map(m => m.localId)));
                                        }
                                    }}
                                >
                                    {selectedMatches.size === matchedItems.length ? "Deselect All" : "Select All"}
                                </Button>
                            </div>
                            <div className="border rounded-md divide-y">
                                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 bg-muted/50 font-medium text-xs text-muted-foreground uppercase">
                                    <div className="w-5"></div>
                                    <div>Item</div>
                                    <div className="w-20 text-right">Current</div>
                                    <div className="w-6"></div>
                                    <div className="w-20 text-right">New</div>
                                </div>
                                <div className="max-h-[50vh] overflow-y-auto divide-y">
                                    {matchedItems.map(match => (
                                        <label 
                                            key={match.localId} 
                                            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 items-center hover:bg-muted/30 cursor-pointer transition-colors"
                                        >
                                            <div className="w-5 flex justify-center">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded border-gray-300"
                                                    checked={selectedMatches.has(match.localId)}
                                                    onChange={() => toggleSelection(match.localId)}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate" title={match.localName}>
                                                    {match.localName}
                                                </p>
                                                {match.score > 0 && (
                                                    <p className="text-[10px] text-orange-500 truncate mt-0.5" title={match.targetName}>
                                                        Matched with: {match.targetName}
                                                    </p>
                                                )}
                                                {match.variantDiffs && match.variantDiffs.length > 0 && (
                                                    <p className="text-[10px] text-amber-600 font-medium mt-1">
                                                        + {match.variantDiffs.length} variant(s)
                                                    </p>
                                                )}
                                            </div>
                                            <div className="w-20 text-right text-sm text-muted-foreground">
                                                ₹{match.localPrice}
                                            </div>
                                            <div className="w-6 flex justify-center text-muted-foreground">
                                                <ArrowRight className="w-4 h-4" />
                                            </div>
                                            <div className="w-20 text-right text-sm font-bold text-green-600 flex flex-col items-end">
                                                <span>₹{match.targetPrice}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    {step === 1 ? (
                        <Button onClick={handleFetch} disabled={isFetching || !targetResId.trim()}>
                            {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Fetch Menu
                        </Button>
                    ) : (
                        <Button 
                            onClick={handleApply} 
                            disabled={selectedMatches.size === 0}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Apply Prices
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
