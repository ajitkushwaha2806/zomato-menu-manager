"use client";
import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
    UtensilsCrossed,
    ArrowLeftRight
} from "lucide-react";
import MenuItemRow from "../menu-item-card";
import TransferPriceModal from "../../header/transfer-price-modal";
import { useState } from "react";
import { useMenu } from "@/store/hooks/useMenu";

export default function MenuItemList({
    activeSubCategoryData,
    addItem,
    updateCatalogue,
    deleteItem,
}) {
    const { globalSearchQuery, menuData } = useMenu();
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    const itemsToSearch = useMemo(() => {
        if (!globalSearchQuery?.trim() || !menuData) return [];
        const items = [];
        menuData.forEach(cat => {
            (cat.sub_category || []).forEach(sub => {
                (sub.items || []).forEach(item => {
                    items.push(item);
                });
            });
        });
        return items;
    }, [menuData, globalSearchQuery]);

    const duplicateNames = (activeSubCategoryData?.items || []).reduce((acc, item) => {
        if (item.name && item.status !== 'delete' && item.status !== 'deleted') {
            const name = item.name.toLowerCase().trim();
            acc.counts[name] = (acc.counts[name] || 0) + 1;
            if (acc.counts[name] > 1) {
                acc.duplicates.add(name);
            }
        }
        return acc;
    }, { counts: {}, duplicates: new Set() }).duplicates;

    const handleAddItem = () => {
        if (!activeSubCategoryData?.id) return;

        addItem({
            subCategoryId: activeSubCategoryData.id,
            item: {
                name: "New Item",
                base_price: 0,
                description: "",
                is_veg: "VEG",
                is_available: true,
                variants: [],
            },
        });
    };

    const handleConvertVariantsToItems = (itemToConvert, groupIndex) => {
        if (!activeSubCategoryData?.id) return;
        
        const group = itemToConvert.variants[groupIndex];
        if (!group || !group.options || group.options.length === 0) return;

        group.options.forEach(option => {
            if (!option.option_name) return;
            addItem({
                subCategoryId: activeSubCategoryData.id,
                item: {
                    ...itemToConvert,
                    id: `temp-${crypto.randomUUID()}`,
                    name: `${option.option_name} ${itemToConvert.name || ''}`.trim(),
                    base_price: option.price || 0,
                    variants: [],
                }
            });
        });

        // Optionally delete the original item if you want it completely replaced
        deleteItem(itemToConvert.id);
    };

    return (
        <div className="flex h-full flex-1 flex-col border-x bg-background/50 backdrop-blur-xl relative">
            <div className="flex-1 overflow-y-auto p-3">
                {(!activeSubCategoryData && !globalSearchQuery?.trim()) ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        Select a subcategory to view items.
                    </div>
                ) : (() => {
                    let visibleItems = [];
                    const isSearching = globalSearchQuery?.trim().length > 0;
                    
                    if (isSearching) {
                        const lowerQ = globalSearchQuery.toLowerCase();
                        visibleItems = itemsToSearch.filter(item => 
                            (item.name || "").toLowerCase().includes(lowerQ) || 
                            (item.description || "").toLowerCase().includes(lowerQ)
                        );
                    } else {
                        visibleItems = activeSubCategoryData?.items || [];
                    }

                    if (visibleItems.length === 0) {
                        return (
                            <div className="flex h-full flex-col gap-2 items-center justify-center text-muted-foreground">
                                {isSearching ? (
                                    <>No items match your search.</>
                                ) : (
                                    <>No items found. Click <b className="mx-1">Add Item</b> to create one.</>
                                )}
                            </div>
                        );
                    }
                    return (
                        <div className="space-y-4 pb-20">
                            {[...visibleItems]
                                .sort((a, b) => {
                                    const aIsDup = a.name && duplicateNames.has(a.name.toLowerCase().trim());
                                    const bIsDup = b.name && duplicateNames.has(b.name.toLowerCase().trim());
                                    if (aIsDup && !bIsDup) return -1;
                                    if (!aIsDup && bIsDup) return 1;
                                    return (a.name || "").localeCompare(b.name || "");
                                })
                                .map((item) => (
                                    <MenuItemRow
                                        key={item.id}
                                        item={item}
                                        isDuplicate={item.name && duplicateNames.has(item.name.toLowerCase().trim())}
                                        onChange={(updatedItem) =>
                                            updateCatalogue(item.id, updatedItem)
                                        }
                                        onDelete={() =>
                                            deleteItem(item.id)
                                        }
                                        onConvertVariantsToItems={handleConvertVariantsToItems}
                                    />
                                ))}
                        </div>
                    );
                })()}
            </div>

            {activeSubCategoryData && !globalSearchQuery?.trim() && (
                <div className="absolute bottom-6 right-6 flex items-center gap-4 z-10">
                    <Button
                        onClick={() => setIsTransferModalOpen(true)}
                        className="h-12 rounded-full px-6 shadow-xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    >
                        <ArrowLeftRight className="h-4 w-4" />
                        Transfer Price
                    </Button>
                    <Button
                        onClick={handleAddItem}
                        className="h-12 rounded-full px-6 shadow-xl shadow-primary/20 gap-2"
                    >
                        <UtensilsCrossed className="h-4 w-4" />
                        Add Item
                    </Button>
                </div>
            )}
            
            <TransferPriceModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
            />
        </div>
    );
}