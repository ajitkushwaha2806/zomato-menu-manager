import { AlertTriangle, Clock } from "lucide-react";
import MenuItemRow from "../../item-view/menu-item-card";

export default function HoldItemsEditor({ allItems, updateItem, deleteItem, categories }) {
    const holdItems = (allItems || []).filter(item => item.onHold);

    if (holdItems.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 h-full bg-white">
                <AlertTriangle className="w-12 h-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600">No Items on Hold</h3>
                <p className="text-sm mt-1 text-center max-w-sm">
                    Great news! None of your menu items are currently under moderation or held by Zomato.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-4 mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6 text-amber-500" /> 
                            Items on Hold
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            These items are currently under review or restricted by the platform. You can edit them below to fix any issues.
                        </p>
                    </div>
                    <div className="px-4 py-1.5 bg-amber-100 text-amber-800 text-sm font-semibold rounded-full flex items-center gap-2">
                        <span>{holdItems.length}</span>
                        <span>Items</span>
                    </div>
                </div>

                <div className="grid gap-6">
                    {holdItems.map((item, index) => (
                        <div key={item._uniqueKey || `${item.id}-${index}`} className="bg-white border border-red-200 shadow-sm rounded-xl overflow-hidden flex flex-col transition-shadow hover:shadow-md">
                            {/* Moderation Warning Header */}
                            {item.holdComments && item.holdComments.length > 0 && (
                                <div className="bg-red-50/80 border-b border-red-100 px-5 py-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Clock className="w-4 h-4 text-red-500" />
                                        <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Moderation Notes</span>
                                    </div>
                                    <ul className="list-disc pl-5 space-y-0.5">
                                        {item.holdComments.map((comment, idx) => (
                                            <li key={idx} className="text-sm text-red-600 font-medium">{comment}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Standard Item Editor Card */}
                            <div className="p-1">
                                <MenuItemRow 
                                    item={item}
                                    onChange={(updates) => {
                                        updateItem(item.id, updates);
                                    }}
                                    onDelete={() => {
                                        deleteItem(item.id);
                                    }}
                                    categories={categories}
                                    isAllItemsView={true}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
