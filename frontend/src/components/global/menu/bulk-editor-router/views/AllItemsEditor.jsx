import { useState, useMemo } from "react";
import { Trash2, Search, AlertCircle } from "lucide-react";

export default function AllItemsEditor({ allItems, deleteItem }) {
    const [searchTerm, setSearchTerm] = useState("");

    const displayItems = useMemo(() => {
        if (!allItems || allItems.length === 0) return [];

        // Count occurrences of each name (case-insensitive)
        const nameCounts = {};
        allItems.forEach(item => {
            const name = (item.name || "").toLowerCase().trim();
            nameCounts[name] = (nameCounts[name] || 0) + 1;
        });

        // Filter and sort items
        return allItems
            .filter(item => {
                if (!searchTerm) return true;
                return (item.name || "").toLowerCase().includes(searchTerm.toLowerCase());
            })
            .sort((a, b) => {
                const nameA = (a.name || "").toLowerCase().trim();
                const nameB = (b.name || "").toLowerCase().trim();
                const countA = nameCounts[nameA] || 0;
                const countB = nameCounts[nameB] || 0;

                // Rank duplicates (count > 1) at the top
                const isDupA = countA > 1;
                const isDupB = countB > 1;

                if (isDupA && !isDupB) return -1;
                if (!isDupA && isDupB) return 1;

                // Sort alphabetically by name
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                
                return 0;
            });
    }, [allItems, searchTerm]);

    const nameOccurrences = useMemo(() => {
        const counts = {};
        if (allItems) {
            allItems.forEach(item => {
                const name = (item.name || "").toLowerCase().trim();
                counts[name] = (counts[name] || 0) + 1;
            });
        }
        return counts;
    }, [allItems]);

    if (!allItems || allItems.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-400">
                No items available.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50/30 w-full overflow-hidden p-4">
            <div className="flex justify-between items-end border-b pb-4 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">All Items</h2>
                    <p className="text-sm text-gray-500">View and manage all items. Duplicates are ranked at the top.</p>
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-64 bg-white shadow-sm"
                    />
                </div>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm relative">
                        <thead className="bg-gray-50 border-b text-gray-500 font-semibold sticky top-0 z-10">
                            <tr>
                                <th className="p-3 w-1/3">Item Name</th>
                                <th className="p-3">Category</th>
                                <th className="p-3">Price (₹)</th>
                                <th className="p-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {displayItems.length > 0 ? (
                                displayItems.map(item => {
                                    const nameKey = (item.name || "").toLowerCase().trim();
                                    const isDuplicate = nameOccurrences[nameKey] > 1;
                                    
                                    return (
                                        <tr key={item.id} className={`hover:bg-gray-50/50 ${isDuplicate ? 'bg-amber-50/30' : ''}`}>
                                            <td className="p-3 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{item.name || "Unnamed Item"}</span>
                                                    {isDuplicate && (
                                                        <span title="Duplicate item name detected" className="flex items-center bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                            <AlertCircle size={10} className="mr-1" /> Duplicate
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 align-middle text-gray-600">
                                                <div className="text-xs">
                                                    <span className="font-medium">{item._parentCategoryName}</span>
                                                    <span className="mx-1 text-gray-300">/</span>
                                                    <span>{item._parentSubCategoryName}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 align-middle font-medium text-gray-700">
                                                ₹{item.base_price ?? "0"}
                                            </td>
                                            <td className="p-3 align-middle text-center">
                                                <button
                                                    onClick={() => deleteItem(item.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete Item"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="4" className="p-8 text-center text-gray-500">
                                        No items found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
