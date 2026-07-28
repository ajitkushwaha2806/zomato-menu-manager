import { useState, useRef, useEffect } from "react";
import { Upload, X, Plus, Trash2, Calculator, Loader2, CheckCircle2, CheckSquare, Square, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import api from "@/lib/api/axios";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function PriceEditor({ allItems, updateItem, menuData }) {
    const [referenceFile, setReferenceFile] = useState(null);
    const [referenceFileType, setReferenceFileType] = useState(null);
    const fileInputRef = useRef(null);


    const { activeResId, activePlatform, getMenuByResId } = useMenu();
    const notification = useNotification();

    const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
    const [bulkMode, setBulkMode] = useState("percentage"); // flat or percentage
    const [bulkAction, setBulkAction] = useState("increase"); // increase or decrease
    const [bulkValue, setBulkValue] = useState("");
    const [roundMode, setRoundMode] = useState("nearest9");
    const [targetSelection, setTargetSelection] = useState("all");
    const [selectedItems, setSelectedItems] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
    const [previewAllItems, setPreviewAllItems] = useState([]);
    const [isPreviewMode, setIsPreviewMode] = useState(false);

    const toggleExpand = (catId) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(catId)) newExpanded.delete(catId);
        else newExpanded.add(catId);
        setExpandedCategories(newExpanded);
    };

    const toggleCategory = (cat, isChecked) => {
        const newSelected = new Set(selectedItems);
        cat.sub_category?.forEach(sub => {
            sub.items?.forEach(item => {
                if (isChecked) newSelected.add(item.id);
                else newSelected.delete(item.id);
            });
        });
        setSelectedItems(Array.from(newSelected));
    };

    const toggleSubCategory = (sub, isChecked) => {
        const newSelected = new Set(selectedItems);
        sub.items?.forEach(item => {
            if (isChecked) newSelected.add(item.id);
            else newSelected.delete(item.id);
        });
        setSelectedItems(Array.from(newSelected));
    };

    const toggleItem = (itemId, isChecked) => {
        const newSelected = new Set(selectedItems);
        if (isChecked) newSelected.add(itemId);
        else newSelected.delete(itemId);
        setSelectedItems(Array.from(newSelected));
    };

    const getCategoryState = (cat) => {
        let totalItems = 0;
        let selectedCount = 0;
        const selectedSet = new Set(selectedItems);
        cat.sub_category?.forEach(sub => {
            sub.items?.forEach(item => {
                totalItems++;
                if (selectedSet.has(item.id)) selectedCount++;
            });
        });
        if (totalItems === 0) return false;
        if (selectedCount === 0) return false;
        if (selectedCount === totalItems) return true;
        return "partial";
    };

    const getSubCategoryState = (sub) => {
        let totalItems = 0;
        let selectedCount = 0;
        const selectedSet = new Set(selectedItems);
        sub.items?.forEach(item => {
            totalItems++;
            if (selectedSet.has(item.id)) selectedCount++;
        });
        if (totalItems === 0) return false;
        if (selectedCount === 0) return false;
        if (selectedCount === totalItems) return true;
        return "partial";
    };

    const submitBulkUpdate = async (preview = true) => {
        if (!bulkValue || isNaN(Number(bulkValue)) || Number(bulkValue) <= 0) {
            notification.error("Please enter a valid positive number for the value.", { duration: 5000 });
            return;
        }

        setIsSubmittingBulk(true);
        try {
            const numVal = Number(bulkValue);
            let finalValue = bulkAction === "decrease" ? `-${numVal}` : `${numVal}`;
            if (bulkMode === "percentage") {
                finalValue += "%";
            }

            if (targetSelection === "items" && selectedItems.length === 0) {
                notification.error("Please select at least one item.", { duration: 5000 });
                setIsSubmittingBulk(false);
                return;
            }

            const { data } = await api.post(`/api/menu/${activeResId}/bulk-editor/price`, {
                value: finalValue,
                roundMode,
                targetSelection,
                selectedItems,
                preview
            });
            
            if (!data.success) {
                throw new Error(data.message || "Failed to bulk update prices");
            }

            if (preview) {
                let flattenedPreview = [];
                const catArray = Array.isArray(data.previewMenu) ? data.previewMenu : data.previewMenu?.categories || [];
                catArray.forEach(cat => {
                    cat.sub_category?.forEach(sub => {
                        sub.items?.forEach(item => {
                            flattenedPreview.push(item);
                        });
                    });
                });
                setPreviewAllItems(flattenedPreview);
                setIsPreviewMode(true);
                setBulkUpdateOpen(false); // Close the sheet to show preview in main view
            } else {
                notification.success(`Successfully updated ${data.updated_items || 0} items/variants!`, { duration: 5000 });
                setBulkUpdateOpen(false);
                setBulkValue("");
                setIsPreviewMode(false);
                setPreviewAllItems([]);
                // Refresh data from server to show updated prices
                getMenuByResId({ resId: activeResId, platform: activePlatform });
            }
        } catch (error) {
            console.error("Bulk update error:", error);
            notification.error(error.message || "Something went wrong", { duration: 5000 });
        } finally {
            setIsSubmittingBulk(false);
        }
    };

    useEffect(() => {
        if (!isPreviewMode) return;
        
        const globalSaveBtn = document.getElementById("global-save-btn");
        if (!globalSaveBtn) return;

        const interceptSave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            submitBulkUpdate(false);
        };

        // Use capture phase to intercept before the normal onClick fires
        globalSaveBtn.addEventListener("click", interceptSave, { capture: true });
        
        // Also add a visual hint to the global button
        const originalText = globalSaveBtn.innerHTML;
        const originalClasses = globalSaveBtn.className;
        
        globalSaveBtn.className = originalClasses.replace("bg-primary", "bg-green-600 hover:bg-green-700");
        
        return () => {
            globalSaveBtn.removeEventListener("click", interceptSave, { capture: true });
            globalSaveBtn.className = originalClasses;
        };
    }, [isPreviewMode, previewAllItems, roundMode, targetSelection, bulkMode, bulkAction, bulkValue, selectedItems]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setReferenceFile(url);
            setReferenceFileType(file.type);
        }
    };

    const removeFile = () => {
        setReferenceFile(null);
        setReferenceFileType(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const inputs = Array.from(document.querySelectorAll('.price-input-field'));
            const index = inputs.indexOf(e.target);
            if (index > -1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
                inputs[index + 1].select();
            }
        }
    };

    const addVariantGroup = (itemId, itemVariants) => {
        if (itemVariants && itemVariants.length >= 1) {
            notification.error("Only a single variant property is allowed.", { duration: 5000 });
            return;
        }

        const newGroup = {
            property_name: "New Group",
            property_id: `temp-${crypto.randomUUID()}`,
            options: [
                { option_name: "Default Option", price: 0, is_default: true, option_id: `temp-${crypto.randomUUID()}` }
            ]
        };
        updateItem({ itemId, updates: { variants: [...(itemVariants || []), newGroup] } });
    };

    const addVariantOption = (itemId, itemVariants, gIdx) => {
        const newVariants = [...itemVariants];
        const newOptions = [...(newVariants[gIdx].options || []), { option_name: "New Option", price: 0, is_default: false, option_id: `temp-${crypto.randomUUID()}` }];
        newVariants[gIdx] = { ...newVariants[gIdx], options: newOptions };
        updateItem({ itemId, updates: { variants: newVariants } });
    };

    const updateVariantGroupName = (itemId, itemVariants, gIdx, newName) => {
        const newVariants = [...itemVariants];
        newVariants[gIdx] = { ...newVariants[gIdx], property_name: newName };
        updateItem({ itemId, updates: { variants: newVariants } });
    };

    const updateVariantOptionName = (itemId, itemVariants, gIdx, oIdx, newName) => {
        const newVariants = [...itemVariants];
        newVariants[gIdx] = { ...newVariants[gIdx], options: [...newVariants[gIdx].options] };
        newVariants[gIdx].options[oIdx] = { ...newVariants[gIdx].options[oIdx], option_name: newName };
        updateItem({ itemId, updates: { variants: newVariants } });
    };

    const deleteVariantGroup = (itemId, itemVariants, gIdx) => {
        const newVariants = itemVariants.filter((_, idx) => idx !== gIdx);
        updateItem({ itemId, updates: { variants: newVariants } });
    };

    const deleteVariantOption = (itemId, itemVariants, gIdx, oIdx) => {
        const newVariants = [...itemVariants];
        const newOptions = (newVariants[gIdx].options || []).filter((_, idx) => idx !== oIdx);
        newVariants[gIdx] = { ...newVariants[gIdx], options: newOptions };
        updateItem({ itemId, updates: { variants: newVariants } });
    };

    if (!allItems || allItems.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-400">
                No items available.
            </div>
        );
    }

    return (
        <div className="flex h-full bg-gray-50/30 w-full overflow-hidden">
            <div className={`transition-all duration-300 border-r border-gray-200 bg-gray-100 flex flex-col ${referenceFile ? 'w-1/2' : 'w-0 hidden'}`}>
                {referenceFile && (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="p-3 border-b bg-white flex justify-between items-center shrink-0 shadow-sm z-10">
                            <span className="text-sm font-bold text-gray-700">Reference Menu</span>
                            <button onClick={removeFile} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto relative bg-[#525659]">
                            {referenceFileType?.includes('pdf') ? (
                                <iframe src={`${referenceFile}#toolbar=0`} className="w-full h-full border-0" title="PDF Reference" />
                            ) : (
                                <img src={referenceFile} alt="Reference" className="max-w-full h-auto object-contain mx-auto" />
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className={`flex-1 overflow-y-auto p-4 ${referenceFile ? '' : 'w-full'}`}>
                <div className="space-y-4">
                    <div className="flex justify-between items-end border-b pb-2">
                        <h2 className="text-lg font-bold text-gray-800">{isPreviewMode ? "Preview Price Changes" : "Price Editor"}</h2>
                        <div className="flex items-center gap-2">
                            {isPreviewMode ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 mr-4">
                                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-800">Preview Mode Active</h3>
                                            <p className="text-xs text-gray-500">Review your price changes below. Click <span className="font-semibold text-gray-700">Save Changes</span> in the top right when you are ready.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsPreviewMode(false)}
                                        className="text-sm font-semibold text-gray-600 hover:text-gray-900 px-4 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors bg-white shadow-sm"
                                    >
                                        Cancel Preview
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setBulkUpdateOpen(true)}
                                        className="flex items-center gap-2 text-sm bg-white/10 text-primary border border-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 font-semibold shadow-sm transition-colors"
                                    >
                                        <Calculator size={16} /> Bulk Update Prices
                                    </button>
                                    {!referenceFile && (
                                        <div>
                                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,application/pdf" className="hidden" />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-semibold text-gray-700 shadow-sm transition-colors"
                                            >
                                                <Upload size={16} /> Open File (Img/PDF)
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                            <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b text-gray-500 font-semibold">
                                <tr>
                                    <th className="p-3 w-1/3">Item Name</th>
                                    <th className="p-3">Base Price (₹)</th>
                                    <th className="p-3 w-1/2">Variants Prices (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {allItems.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50/50">
                                        <td className="p-3 font-medium text-gray-900 align-top">
                                            {item.name || "Unnamed Item"}
                                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                                                {item._parentCategoryName} &gt; {item._parentSubCategoryName}
                                            </div>
                                        </td>
                                        <td className="p-3 align-top">
                                            {(() => {
                                                const previewItem = isPreviewMode ? previewAllItems.find(i => i.id === item.id) : null;
                                                const hasChanged = previewItem && previewItem.base_price !== item.base_price;
                                                
                                                if (isPreviewMode && previewItem) {
                                                    return hasChanged ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-gray-400 line-through text-[12px] font-medium w-24 px-2 py-0.5">₹{item.base_price ?? "0"}</span>
                                                            <span className="text-green-700 font-bold text-sm bg-green-50 px-2 py-1 rounded-md w-24 border border-green-200 shadow-sm flex items-center justify-center">
                                                                ₹{previewItem.base_price}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-700 font-semibold text-sm w-24 px-2 py-1 inline-block opacity-60">₹{item.base_price ?? "0"}</span>
                                                    );
                                                }

                                                return (
                                                    <input
                                                        type="number"
                                                        value={item.base_price ?? ""}
                                                        onChange={(e) => updateItem({ itemId: item.id, updates: { base_price: e.target.value === "" ? "" : Number(e.target.value) } })}
                                                        onKeyDown={handleKeyDown}
                                                        className="price-input-field w-24 border rounded-md px-2 py-1 outline-none focus:border-primary text-sm font-semibold bg-white shadow-sm"
                                                        placeholder="0"
                                                    />
                                                );
                                            })()}
                                        </td>
                                        <td className="p-3 align-top space-y-3">
                                            {(!item.variants || item.variants.length === 0) ? (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-gray-400 text-xs italic">No variants</span>
                                                    {!isPreviewMode && (
                                                        <button
                                                            onClick={() => addVariantGroup(item.id, item.variants)}
                                                            className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20 flex items-center gap-1 transition-colors"
                                                        >
                                                            <Plus size={10} strokeWidth={3} /> Add Variant
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {item.variants.map((group, gIdx) => (
                                                        <div key={gIdx} className="space-y-1.5 p-2 bg-gray-50/50 border border-gray-100 rounded-md shadow-sm">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={group.property_name}
                                                                        onChange={(e) => updateVariantGroupName(item.id, item.variants, gIdx, e.target.value)}
                                                                        disabled={isPreviewMode}
                                                                        className={`text-xs font-semibold text-gray-700 bg-transparent outline-none ${isPreviewMode ? 'opacity-80' : 'focus:border-b focus:border-primary'} px-1 w-24`}
                                                                    />
                                                                    {!isPreviewMode && (
                                                                        <button
                                                                            onClick={() => addVariantOption(item.id, item.variants, gIdx)}
                                                                            className="text-[10px] font-bold text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                                                                        >
                                                                            <Plus size={10} strokeWidth={3} /> Option
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {!isPreviewMode && (
                                                                    <button
                                                                        onClick={() => deleteVariantGroup(item.id, item.variants, gIdx)}
                                                                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                                                                        title="Delete Group"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {(group.options || []).map((opt, oIdx) => (
                                                                    <div key={oIdx} className="flex items-center text-xs bg-white rounded border border-gray-200 overflow-hidden shadow-sm focus-within:border-primary">
                                                                        <input
                                                                            type="text"
                                                                            value={opt.option_name || ""}
                                                                            onChange={(e) => updateVariantOptionName(item.id, item.variants, gIdx, oIdx, e.target.value)}
                                                                            disabled={isPreviewMode}
                                                                            className={`px-2 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-700 font-medium outline-none w-16 ${isPreviewMode ? 'opacity-80' : ''}`}
                                                                            placeholder="Opt"
                                                                        />
                                                                        {(() => {
                                                                            const previewItem = isPreviewMode ? previewAllItems.find(i => i.id === item.id) : null;
                                                                            const previewOpt = previewItem?.variants?.[gIdx]?.options?.[oIdx];
                                                                            const hasChanged = previewOpt && previewOpt.price !== opt.price;

                                                                            if (isPreviewMode && previewItem) {
                                                                                return hasChanged ? (
                                                                                    <div className="flex flex-col gap-0.5 px-1 py-1 w-16 bg-green-50 justify-center">
                                                                                        <span className="text-[10px] text-gray-400 line-through text-center leading-none">₹{opt.price ?? "0"}</span>
                                                                                        <span className="text-green-700 font-bold text-xs text-center leading-none">₹{previewOpt.price}</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex flex-col gap-0.5 px-1 py-1.5 w-16 justify-center opacity-60">
                                                                                        <span className="text-gray-700 font-semibold text-xs text-center">₹{opt.price ?? "0"}</span>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <input
                                                                                    type="number"
                                                                                    value={opt.price ?? ""}
                                                                                    onChange={(e) => {
                                                                                        const newVariants = [...item.variants];
                                                                                        newVariants[gIdx] = { ...newVariants[gIdx], options: [...newVariants[gIdx].options] };
                                                                                        newVariants[gIdx].options[oIdx] = { ...newVariants[gIdx].options[oIdx], price: e.target.value === "" ? "" : Number(e.target.value) };
                                                                                        updateItem({ itemId: item.id, updates: { variants: newVariants } });
                                                                                    }}
                                                                                    onKeyDown={handleKeyDown}
                                                                                    className="price-input-field w-16 px-1 py-1.5 outline-none bg-white font-semibold text-center focus:bg-primary/5"
                                                                                    placeholder="0"
                                                                                />
                                                                            );
                                                                        })()}
                                                                        {!isPreviewMode && (
                                                                            <button
                                                                                onClick={() => deleteVariantOption(item.id, item.variants, gIdx, oIdx)}
                                                                                className="bg-gray-50 px-1.5 py-1.5 border-l border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                                                title="Remove Option"
                                                                            >
                                                                                <X size={12} strokeWidth={2.5} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!item.variants || item.variants.length < 1) && !isPreviewMode && (
                                                        <button
                                                            onClick={() => addVariantGroup(item.id, item.variants)}
                                                            className="text-[10px] font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors flex items-center gap-1 mt-1"
                                                        >
                                                            <Plus size={10} strokeWidth={3} /> Add Variant Group
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <Sheet open={bulkUpdateOpen} onOpenChange={setBulkUpdateOpen}>
                <SheetContent className="max-w-md w-full sm:max-w-md p-0 flex flex-col h-full bg-slate-50 border-l-0 sm:border-l shadow-2xl">
                    <SheetHeader className="px-6 py-5 bg-white border-b border-gray-100 shrink-0">
                        <SheetTitle className="text-xl">Bulk Price Update</SheetTitle>
                        <SheetDescription className="text-gray-500">
                            Apply a flat or percentage increase/decrease to all items and variants in this menu.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-600">Apply To</label>
                                    <div className="flex border rounded-md overflow-hidden">
                                        <button
                                            onClick={() => setTargetSelection("all")}
                                            className={`flex-1 py-1.5 px-2 text-xs font-medium ${targetSelection === "all" ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                        >
                                            Entire Menu
                                        </button>
                                        <button
                                            onClick={() => setTargetSelection("items")}
                                            className={`flex-1 py-1.5 px-2 text-xs font-medium border-l ${targetSelection === "items" ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                        >
                                            Selected Items
                                        </button>
                                    </div>
                                </div>

                                {targetSelection === "items" && menuData && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-gray-600">Select Items</label>
                                        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 bg-white shadow-sm space-y-1">
                                            {menuData.map(cat => {
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
                                                                className="cursor-pointer text-gray-400 hover:text-primary transition-colors flex items-center justify-center"
                                                                onClick={() => toggleCategory(cat, catState !== true)}
                                                            >
                                                                {catState === true ? <CheckSquare className="w-4 h-4 text-primary" /> : 
                                                                 catState === "partial" ? <div className="w-4 h-4 border-[2px] border-primary bg-primary/20 rounded-[3px]" /> : 
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
                                                                                    className="cursor-pointer text-gray-400 hover:text-primary transition-colors flex items-center justify-center"
                                                                                    onClick={() => toggleSubCategory(sub, subState !== true)}
                                                                                >
                                                                                    {subState === true ? <CheckSquare className="w-4 h-4 text-primary" /> : 
                                                                                     subState === "partial" ? <div className="w-4 h-4 border-[2px] border-primary bg-primary/20 rounded-[3px]" /> : 
                                                                                     <Square className="w-4 h-4" />}
                                                                                </div>
                                                                                <span className="font-medium text-[12px] text-gray-700 truncate">{sub.name || "Unnamed Subcategory"}</span>
                                                                            </div>
                                                                            
                                                                            <div className="ml-6 space-y-0.5 mt-1">
                                                                                {sub.items?.map(item => {
                                                                                    const isItemChecked = selectedItems.includes(item.id);
                                                                                    return (
                                                                                        <div key={item.id} className="flex items-center gap-2 py-1 hover:bg-slate-50 rounded px-2 transition-colors">
                                                                                            <div 
                                                                                                className="cursor-pointer text-gray-300 hover:text-primary transition-colors flex items-center justify-center"
                                                                                                onClick={() => toggleItem(item.id, !isItemChecked)}
                                                                                            >
                                                                                                {isItemChecked ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
                                                                                            </div>
                                                                                            <span className="text-[12px] text-gray-600 truncate">{item.name || "Unnamed Item"}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-gray-600">Action</label>
                                        <div className="flex border rounded-md overflow-hidden">
                                            <button
                                                onClick={() => setBulkAction("increase")}
                                                className={`flex-1 py-1.5 text-sm font-medium ${bulkAction === "increase" ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                +
                                            </button>
                                            <button
                                                onClick={() => setBulkAction("decrease")}
                                                className={`flex-1 py-1.5 text-sm font-medium border-l ${bulkAction === "decrease" ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                -
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-gray-600">Type</label>
                                        <div className="flex border rounded-md overflow-hidden">
                                            <button
                                                onClick={() => setBulkMode("percentage")}
                                                className={`flex-1 py-1.5 px-2 text-sm font-medium ${bulkMode === "percentage" ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                %
                                            </button>
                                            <button
                                                onClick={() => setBulkMode("flat")}
                                                className={`flex-1 py-1.5 text-sm font-medium border-l ${bulkMode === "flat" ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                Flat
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-600">Value</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={bulkValue}
                                            onChange={(e) => setBulkValue(e.target.value)}
                                            placeholder={bulkMode === "percentage" ? "e.g. 10" : "e.g. 50"}
                                            className="w-full border rounded-md px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                                            {bulkMode === "percentage" ? "%" : "₹"}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Rounding Option</label>
                                    <select
                                        value={roundMode}
                                        onChange={(e) => setRoundMode(e.target.value)}
                                        className="w-full border rounded-md px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-sm font-medium text-gray-700 bg-white"
                                    >
                                        <option value="none">No Rounding</option>
                                        <option value="nearest9">Simply Round to 9 (e.g. ₹300 → ₹299)</option>
                                        <option value="next9">Round to Next 9 Only (e.g. ₹301 → ₹309)</option>
                                    </select>
                                </div>
                            </div>

                            <SheetFooter className="p-6 bg-white border-t border-gray-100 shrink-0 flex-col gap-3 sm:flex-col sm:space-x-0">
                                <Button
                                    type="button"
                                    onClick={() => submitBulkUpdate(true)}
                                    disabled={isSubmittingBulk || !bulkValue}
                                    className="w-full gap-2 h-11 text-[15px] font-semibold rounded-xl"
                                >
                                    {isSubmittingBulk ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    Preview Changes
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setBulkUpdateOpen(false)}
                                    className="w-full h-11 text-[15px] font-semibold rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </Button>
                            </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}
