"use client";

import { useState, useEffect } from "react";
import { Link as LinkIcon, CheckSquare, Square, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkAssignmentPanel({ activeAddon, menuData, bulkToggleAddon, onClose }) {
    const [selectedItemIds, setSelectedItemIds] = useState(new Set());
    const [expandedCategories, setExpandedCategories] = useState(new Set());

    useEffect(() => {
        if (activeAddon?.id && menuData) {
            const initialSelected = new Set();
            menuData.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    sub.items?.forEach(item => {
                        if (item.addons?.includes(activeAddon.id)) {
                            initialSelected.add(item.id);
                        }
                    });
                });
            });
            setSelectedItemIds(initialSelected);
        }
    }, [activeAddon?.id, menuData]);

    const toggleExpand = (catId) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(catId)) newExpanded.delete(catId);
        else newExpanded.add(catId);
        setExpandedCategories(newExpanded);
    };

    const handleApply = () => {
        // Find all item IDs in the menu
        const allItemIds = [];
        menuData?.forEach(cat => {
            cat.sub_category?.forEach(sub => {
                sub.items?.forEach(item => {
                    allItemIds.push(item.id);
                });
            });
        });

        // Split into items to attach vs detach
        const itemsToAttach = [];
        const itemsToDetach = [];
        
        allItemIds.forEach(id => {
            if (selectedItemIds.has(id)) itemsToAttach.push(id);
            else itemsToDetach.push(id);
        });

        if (itemsToAttach.length > 0) bulkToggleAddon(activeAddon.id, itemsToAttach, true);
        if (itemsToDetach.length > 0) bulkToggleAddon(activeAddon.id, itemsToDetach, false);
        
        onClose();
    };

    const toggleCategory = (cat, isChecked) => {
        const newSelected = new Set(selectedItemIds);
        cat.sub_category?.forEach(sub => {
            sub.items?.forEach(item => {
                if (isChecked) newSelected.add(item.id);
                else newSelected.delete(item.id);
            });
        });
        setSelectedItemIds(newSelected);
    };

    const toggleSubCategory = (sub, isChecked) => {
        const newSelected = new Set(selectedItemIds);
        sub.items?.forEach(item => {
            if (isChecked) newSelected.add(item.id);
            else newSelected.delete(item.id);
        });
        setSelectedItemIds(newSelected);
    };

    const toggleItem = (itemId, isChecked) => {
        const newSelected = new Set(selectedItemIds);
        if (isChecked) newSelected.add(itemId);
        else newSelected.delete(itemId);
        setSelectedItemIds(newSelected);
    };

    const getCategoryState = (cat) => {
        let totalItems = 0;
        let selectedItems = 0;
        cat.sub_category?.forEach(sub => {
            sub.items?.forEach(item => {
                totalItems++;
                if (selectedItemIds.has(item.id)) selectedItems++;
            });
        });
        if (totalItems === 0) return false;
        if (selectedItems === 0) return false;
        if (selectedItems === totalItems) return true;
        return "partial";
    };

    const getSubCategoryState = (sub) => {
        let totalItems = 0;
        let selectedItems = 0;
        sub.items?.forEach(item => {
            totalItems++;
            if (selectedItemIds.has(item.id)) selectedItems++;
        });
        if (totalItems === 0) return false;
        if (selectedItems === 0) return false;
        if (selectedItems === totalItems) return true;
        return "partial";
    };

    return (
        <div className="flex flex-col h-full w-full bg-white z-10 border-l border-blue-100">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/50">
                <h3 className="flex items-center gap-2 font-semibold text-blue-800 text-[15px] truncate">
                    <LinkIcon className="w-4 h-4 shrink-0" /> Link: {activeAddon?.name}
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-gray-500 hover:text-gray-900 rounded-full hover:bg-white shrink-0 ml-2">
                    <X className="w-4 h-4" />
                </Button>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 bg-slate-50 min-h-0">
                <p className="text-[13px] text-gray-500 mb-3 px-1 leading-relaxed shrink-0">
                    Select the categories or specific items that should have this addon group attached.
                </p>
                
                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl bg-white shadow-sm p-3 min-h-0">
                    <div className="space-y-1">
                        {menuData?.map(cat => {
                            const catState = getCategoryState(cat);
                            const isExpanded = expandedCategories.has(cat.id);
                            return (
                                <div key={cat.id} className="select-none">
                                    <div className="flex items-center gap-2 py-1.5 hover:bg-slate-50 rounded-lg px-2 group transition-colors">
                                        <div 
                                            className="w-5 h-5 flex items-center justify-center cursor-pointer text-gray-400 hover:text-gray-800"
                                            onClick={() => toggleExpand(cat.id)}
                                        >
                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </div>
                                        <div 
                                            className="cursor-pointer text-gray-400 hover:text-blue-600 transition-colors"
                                            onClick={() => toggleCategory(cat, catState !== true)}
                                        >
                                            {catState === true ? <CheckSquare className="w-4 h-4 text-blue-600" /> : 
                                             catState === "partial" ? <div className="w-4 h-4 border-[2px] border-blue-600 bg-blue-100 rounded-[3px]" /> : 
                                             <Square className="w-4 h-4" />}
                                        </div>
                                        <span className="font-semibold text-[13px] text-gray-800 cursor-pointer truncate" onClick={() => toggleExpand(cat.id)}>
                                            {cat.name || "Unnamed Category"}
                                        </span>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="ml-7 border-l-2 border-gray-100 pl-2 space-y-1 mt-1 mb-2">
                                            {cat.sub_category?.map(sub => {
                                                const subState = getSubCategoryState(sub);
                                                return (
                                                    <div key={sub.id}>
                                                        <div className="flex items-center gap-2 py-1 hover:bg-slate-50 rounded-md px-2 transition-colors">
                                                            <div 
                                                                className="cursor-pointer text-gray-400 hover:text-blue-600 transition-colors"
                                                                onClick={() => toggleSubCategory(sub, subState !== true)}
                                                            >
                                                                {subState === true ? <CheckSquare className="w-4 h-4 text-blue-600" /> : 
                                                                 subState === "partial" ? <div className="w-4 h-4 border-[2px] border-blue-600 bg-blue-100 rounded-[3px]" /> : 
                                                                 <Square className="w-4 h-4" />}
                                                            </div>
                                                            <span className="font-medium text-[12px] text-gray-700 truncate">{sub.name || "Unnamed Subcategory"}</span>
                                                        </div>
                                                        
                                                        <div className="ml-6 space-y-0.5 mt-1">
                                                            {sub.items?.map((item, index) => (
                                                                <div key={item._uniqueKey || `${sub.id}-${item.id}-${index}`} className="flex items-center gap-2 py-1 hover:bg-slate-50 rounded px-2 transition-colors">
                                                                    <div 
                                                                        className="cursor-pointer text-gray-300 hover:text-blue-600 transition-colors"
                                                                        onClick={() => toggleItem(item.id, !selectedItemIds.has(item.id))}
                                                                    >
                                                                        {selectedItemIds.has(item.id) ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                                                                    </div>
                                                                    <span className="text-[12px] text-gray-600 truncate">{item.name || "Unnamed Item"}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {(!menuData || menuData.length === 0) && (
                            <div className="text-center text-sm text-gray-500 py-6">
                                No items found in menu.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-white shrink-0">
                <Button onClick={handleApply} className="w-full bg-blue-600 hover:bg-blue-700 font-semibold shadow-md transition-all">
                    Apply to Items
                </Button>
            </div>
        </div>
    );
}
