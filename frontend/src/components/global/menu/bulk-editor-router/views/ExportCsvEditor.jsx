import { Download, Table } from "lucide-react";
import useNotification from "@/store/hooks/useNotification";

export default function ExportCsvEditor({ allItems }) {
    const notification = useNotification();

    const handleExport = () => {
        if (!allItems || allItems.length === 0) {
            notification.error("No items available to export.");
            return;
        }

        try {
            // Prepare data for CSV
            const csvRows = [];
            
            // Define headers
            const headers = [
                "Category", 
                "Sub Category", 
                "Item Name", 
                "Description", 
                "Price", 
                "Veg/Non-Veg", 
                "Status", 
                "In Stock",
                "Image URL"
            ];
            csvRows.push(headers.join(","));

            // Add rows
            allItems.forEach(item => {
                const category = `"${(item._parentCategoryName || "").replace(/"/g, '""')}"`;
                const subcategory = `"${(item._parentSubCategoryName || "").replace(/"/g, '""')}"`;
                const desc = `"${(item.description || "").replace(/"/g, '""')}"`;
                const vegNonVeg = item.is_veg ? "Veg" : "Non-Veg";
                const status = item.status || "active";
                const inStock = item.in_stock ? "Yes" : "No";
                const imgUrl = item?.media?.[0]?.url || item?.media?.[0]?.thumbUrl || item.image_url || (typeof item.image === 'string' ? item.image : item.image?.url) || "";

                let variantsHandled = false;

                if (item.variants && item.variants.length > 0) {
                    item.variants.forEach(groupOrVariant => {
                        // Case 1: It's a group with nested options
                        if (groupOrVariant.options && groupOrVariant.options.length > 0) {
                            groupOrVariant.options.forEach(opt => {
                                const groupName = groupOrVariant.group_name || groupOrVariant.property_name || groupOrVariant.name || "Variant";
                                const optName = opt.option_name || opt.name || opt.title || "Unknown Option";
                                const variantName = groupName && groupName !== "Default" && groupName !== "Quantities" 
                                    ? `${item.name} - ${groupName} - ${optName}`
                                    : `${item.name} - ${optName}`;
                                    
                                const name = `"${(variantName || "").replace(/"/g, '""')}"`;
                                const price = opt.price ?? opt.base_price ?? 0;
                                
                                csvRows.push([
                                    category, subcategory, name, desc, price, vegNonVeg, status, inStock, `"${imgUrl}"`
                                ].join(","));
                                variantsHandled = true;
                            });
                        } 
                        // Case 2: It's a direct variant without nested options
                        else if (!groupOrVariant.options && (groupOrVariant.price !== undefined || groupOrVariant.option_name || groupOrVariant.name)) {
                            const optName = groupOrVariant.option_name || groupOrVariant.name || groupOrVariant.title || "Unknown Option";
                            const variantName = `${item.name} - ${optName}`;
                            
                            const name = `"${(variantName || "").replace(/"/g, '""')}"`;
                            const price = groupOrVariant.price ?? groupOrVariant.base_price ?? 0;
                            
                            csvRows.push([
                                category, subcategory, name, desc, price, vegNonVeg, status, inStock, `"${imgUrl}"`
                            ].join(","));
                            variantsHandled = true;
                        }
                    });
                } 

                // Fallback to base item if no variants were extracted
                if (!variantsHandled) {
                    const name = `"${(item.name || "").replace(/"/g, '""')}"`;
                    const price = item.base_price ?? item.price ?? 0;

                    csvRows.push([
                        category, subcategory, name, desc, price, vegNonVeg, status, inStock, `"${imgUrl}"`
                    ].join(","));
                }
            });

            const csvString = csvRows.join("\n");
            
            // Create a blob and trigger download
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `menu_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            notification.success("Menu exported successfully!");
        } catch (error) {
            console.error("CSV Export failed:", error);
            notification.error("Failed to export menu as CSV.");
        }
    };

    return (
        <div className="flex-1 flex overflow-hidden relative bg-neutral-50/40">
            <div className="flex-1 overflow-y-auto p-6 transition-all duration-300 ease-in-out w-full">
                <div className="mx-auto space-y-6">
                    <div className="border-b border-neutral-200/60 pb-4">
                        <h2 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
                            <Table className="w-6 h-6 text-primary" /> Export Menu as CSV
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Download your entire menu with all categories, items, and details in a CSV format.
                        </p>
                    </div>

                    <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                            <div className="p-3 bg-primary/10 rounded-full text-primary">
                                <Table className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-800">
                                    {allItems.length} Items Ready to Export
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Your entire menu consisting of {allItems.length} items will be exported to a CSV file.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleExport}
                            disabled={!allItems || allItems.length === 0}
                            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 text-primary-foreground py-3 px-4 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                        >
                            <Download className="w-5 h-5" />
                            Download CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
