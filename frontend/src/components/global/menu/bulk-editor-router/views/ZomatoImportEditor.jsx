import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import useNotification from "@/store/hooks/useNotification";
import { Loader2, CheckCircle2, Link as LinkIcon, Download } from "lucide-react";
import axios from "axios";
import { fetchMenuByResId } from "@/store/slice/menuSlice";

export default function ZomatoImportEditor() {
    const { activeResId } = useSelector((state) => state.menu);
    const dispatch = useDispatch();
    const notification = useNotification();
    
    const [pageUrl, setPageUrl] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState(null); // 'success', 'error'
    const [stats, setStats] = useState(null);

    const handleImport = async () => {
        if (!pageUrl.trim()) {
            notification.error("Please enter a Zomato URL");
            return;
        }
        
        if (!activeResId) {
            notification.error("Restaurant ID is missing.");
            return;
        }

        setIsImporting(true);
        setImportStatus(null);
        setStats(null);

        try {
            const { data } = await axios.get(`/api/menu/${activeResId}/zomato/scrape`, {
                params: { pageUrl: pageUrl.trim() }
            });

            if (data.success) {
                notification.success("Menu imported successfully!", { duration: 5000 });
                setImportStatus("success");
                setStats({
                    categories: data.total_categories,
                    items: data.total_items
                });
                dispatch(fetchMenuByResId({ resId: activeResId, platform: 'zomato' }));
                setPageUrl("");
            } else {
                throw new Error(data.message || "Import failed");
            }
        } catch (error) {
            console.error("Import error:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to import menu", { duration: 5000 });
            setImportStatus("error");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="flex-1 overflow-auto bg-gray-50/50 p-6 flex flex-col relative">
            <div className="mb-6 flex justify-between items-start">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Import Zomato Menu</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Enter a Zomato order URL to automatically import the entire menu.
                    </p>
                </div>
            </div>

            <div className="w-full max-w-2xl mx-auto mt-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Zomato URL
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <LinkIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={pageUrl}
                            onChange={(e) => setPageUrl(e.target.value)}
                            placeholder="e.g. https://www.zomato.com/ncr/restaurant-name/order"
                            disabled={isImporting}
                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Ensure you are pasting the correct full order URL for your restaurant on Zomato. Note that importing will overwrite the existing Zomato menu data for this restaurant.
                    </p>
                </div>

                {importStatus === "success" && stats && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-green-800">Import Successful</h4>
                            <p className="text-sm text-green-700 mt-1">
                                Successfully imported {stats.categories} categories and {stats.items} items.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-gray-100">
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !pageUrl.trim()}
                        className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isImporting ? "Importing..." : "Start Import"}
                    </button>
                </div>
            </div>
        </div>
    );
}
