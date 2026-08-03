import { useState } from "react";
import { Sparkles, Loader2, Zap, CheckSquare } from "lucide-react";
import api from "@/lib/api/axios";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";

export default function DescriptionEditor({ allItems, updateItem }) {
    const { activeResId, activePlatform, getMenuByResId, queueDescriptionUpdates } = useMenu();
    const notification = useNotification();
    const [isGenerating, setIsGenerating] = useState(false);

    if (!allItems || allItems.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-400">
                No items available.
            </div>
        );
    }

    const generateDescriptions = async () => {
        setIsGenerating(true);
        try {
            const { data } = await api.post(`/api/menu/${activeResId}/bulk-editor/description`, {
                platform: activePlatform || "zomato"
            });

            if (!data.success) {
                throw new Error(data.message || "Failed to generate descriptions");
            }

            notification.success(`Successfully generated ${data.updated_items || 0} descriptions!`, {
                duration: 5000,
            });
            getMenuByResId({ resId: activeResId, platform: activePlatform });
        } catch (error) {
            console.error("Generate description error:", error);
            const errMsg = error.response?.data?.message || error.message || "Something went wrong while generating descriptions.";
            notification.error(errMsg, {
                duration: 5000
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const clearAllDescriptions = () => {
        if (!window.confirm("Are you sure you want to clear all descriptions? This action cannot be undone.")) return;
        
        let count = 0;
        allItems.forEach(item => {
            if (item.description) {
                updateItem({ itemId: item.id, updates: { description: "" } });
                count++;
            }
        });
        
        notification.success(`Cleared ${count} description${count !== 1 ? 's' : ''}.`, { duration: 3000 });
    };

    const enrichItems = () => {
        let count = 0;
        allItems.forEach(item => {
            const isNew = item.id?.toString().startsWith("temp-") || item.temp_id?.toString().startsWith("temp-");
            const isUpdate = item.temp_id?.toString().startsWith("update-");
            
            if (isNew || isUpdate) {
                let updated = false;
                let newName = item.name || "";
                let newDesc = item.description || "";
                const catName = (item._parentCategoryName || "").toLowerCase();
                const subCatName = (item._parentSubCategoryName || "").toLowerCase();
                const itemNameLower = newName.toLowerCase();
                
                const matchesPizza = catName.includes("pizza") || subCatName.includes("pizza") || itemNameLower.includes("pizza");
                const matchesChaap = catName.includes("chaap") || subCatName.includes("chaap") || itemNameLower.includes("chaap");
                const matchesMomo = catName.includes("momo") || subCatName.includes("momo") || itemNameLower.includes("momo");
                const matchesBeverage = catName.includes("beverage") || subCatName.includes("beverage") || catName.includes("drink") || itemNameLower.includes("beverage");

                if (matchesPizza) {
                    if (!itemNameLower.includes("inch")) {
                        let sizeToAppend = "6 inch";
                        if (item.variants && item.variants.length > 0) {
                            let minSize = null;
                            item.variants.forEach(v => {
                                (v.options || []).forEach(opt => {
                                    const optName = (opt.option_name || opt.name || "").toLowerCase();
                                    const match = optName.match(/(\d+)\s*(?:inch|inches|'')/i);
                                    if (match) {
                                        const size = parseInt(match[1]);
                                        if (minSize === null || size < minSize) {
                                            minSize = size;
                                        }
                                    }
                                });
                            });
                            if (minSize !== null) {
                                sizeToAppend = `${minSize} inch`;
                            }
                        }
                        newName = `${newName} [${sizeToAppend}]`.trim();
                        updated = true;
                    }
                }
                
                if (matchesChaap) {
                    if (!newDesc.toLowerCase().includes("mock meat")) {
                        newDesc = newDesc ? `${newDesc} - Made with mock meat` : "Made with mock meat";
                        updated = true;
                    }
                }
                
                if (matchesMomo) {
                    if (!itemNameLower.includes("pcs") && !itemNameLower.includes("piece")) {
                        newName = `${newName} [6 pcs]`.trim();
                        updated = true;
                    }
                }
                
                if (matchesBeverage) {
                    if (!itemNameLower.includes("ml")) {
                        newName = `${newName} [200 ML]`.trim();
                        updated = true;
                    }
                }
                
                if (updated) {
                    updateItem({ itemId: item.id, updates: { name: newName, description: newDesc } });
                    count++;
                }
            }
        });
        
        notification.success(`Enriched ${count} items!`, { duration: 3000 });
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
            <div className="mx-auto space-y-4">
                <div className="flex justify-between items-end border-b pb-2">
                    <h2 className="text-lg font-bold text-gray-800">Description Editor</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearAllDescriptions}
                            disabled={isGenerating}
                            className="flex items-center gap-2 text-sm bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 font-semibold shadow-sm transition-colors disabled:opacity-50"
                        >
                            Clear all
                        </button>
                        <button
                            onClick={enrichItems}
                            disabled={isGenerating}
                            className="flex items-center gap-2 text-sm bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-200 font-semibold shadow-sm transition-colors disabled:opacity-50"
                        >
                            <Zap size={16} />
                            Enrich Items
                        </button>
                        <button
                            onClick={generateDescriptions}
                            disabled={isGenerating}
                            className="flex items-center gap-2 text-sm bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-200 font-semibold shadow-sm transition-colors disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isGenerating ? "Generating..." : "Generate descriptions (AI)"}
                        </button>
                        {/* {activePlatform === 'swiggy' && ( */}
                            <button
                                onClick={() => {
                                    queueDescriptionUpdates();
                                    notification.success("Swiggy description updates queued successfully!", { duration: 3000 });
                                }}
                                className="flex items-center gap-2 text-sm bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-semibold shadow-sm transition-colors"
                            >
                                <CheckSquare size={16} /> Queue Descriptions
                            </button>
                        {/* )} */}
                    </div>
                </div>

                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b text-gray-500 font-semibold">
                            <tr>
                                <th className="p-3 w-1/3">Item Name</th>
                                <th className="p-3">Description</th>
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
                                        <textarea
                                            value={item.description || ""}
                                            onChange={(e) => updateItem({ itemId: item.id, updates: { description: e.target.value } })}
                                            className="w-full border rounded-md px-3 py-2 outline-none focus:border-primary text-sm min-h-[80px] resize-y bg-white"
                                            placeholder="Add item description..."
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
