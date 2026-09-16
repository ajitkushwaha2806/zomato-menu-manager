import { useMemo } from "react";
import PriceEditor from "./views/PriceEditor";
import DescriptionEditor from "./views/DescriptionEditor";
import ImageEditor from "./views/ImageEditor";
import UploadMenuEditor from "./views/UploadMenuEditor";
import TransferMenuEditor from "./views/TransferMenuEditor";
import StructureEditor from "./views/StructureEditor";
import AddonsBuilder from "./views/AddonsBuilder";
import ExportImagesEditor from "./views/ExportImagesEditor";
import HoldItemsEditor from "./views/HoldItemsEditor";
import SwiggyTicketsViewer from "./views/tickets/SwiggyTicketsViewer";
import ExportCsvEditor from "./views/ExportCsvEditor";
import AllItemsEditor from "./views/AllItemsEditor";
import ZomatoImportEditor from "./views/ZomatoImportEditor";

export default function BulkEditorRouter({
    activeBulkMode,
    menuData,
    updateItem,
    deleteItem,
    moveItem,
    activeResId
}) {
    const filteredMenuData = useMemo(() => {
        if (!Array.isArray(menuData)) return [];
        return menuData
            .filter(cat => cat.status !== 'delete' && cat.status !== 'deleted')
            .map(cat => ({
                ...cat,
                sub_category: (cat.sub_category || [])
                    .filter(sub => sub.status !== 'delete' && sub.status !== 'deleted')
                    .map(sub => ({
                        ...sub,
                        items: (sub.items || [])
                            .filter(item => item.status !== 'delete' && item.status !== 'deleted')
                            .map(item => ({
                                ...item,
                                variants: (item.variants || [])
                            }))
                    }))
            }));
    }, [menuData]);

    const allItems = useMemo(() => {
        return filteredMenuData.flatMap(cat =>
            (cat.sub_category || []).flatMap(sub =>
                (sub.items || []).map(item => ({
                    ...item,
                    _parentSubCategoryId: sub.id,
                    _parentSubCategoryName: sub.name,
                    _parentCategoryName: cat.name
                }))
            )
        );
    }, [filteredMenuData]);

    switch (activeBulkMode) {
        case "PRICE":
            return <PriceEditor allItems={allItems} updateItem={updateItem} menuData={filteredMenuData} />;
        case "DESCRIPTION":
            return <DescriptionEditor allItems={allItems} updateItem={updateItem} />;
        case "IMAGE":
            return <ImageEditor allItems={allItems} updateItem={updateItem} />;
        case "UPLOAD":
            return <UploadMenuEditor />;
        case "TRANSFER":
            return <TransferMenuEditor />;
        case "STRUCTURE":
            return <StructureEditor menuData={filteredMenuData} />;
        case "ADDONS":
            return <AddonsBuilder />;
        case "HOLD_ITEMS":
            return <HoldItemsEditor allItems={allItems} updateItem={updateItem} deleteItem={deleteItem} categories={filteredMenuData} />;
        case "EXPORT_IMAGES":
            return <ExportImagesEditor allItems={allItems} />;
        case "EXPORT_CSV":
            return <ExportCsvEditor allItems={allItems} />;
        case "ALL_ITEMS":
            return <AllItemsEditor allItems={allItems} deleteItem={deleteItem} />;
        case "TICKETS":
            return <SwiggyTicketsViewer resId={activeResId} />;
        case "ZOMATO_IMPORT":
            return <ZomatoImportEditor />;
        default:
            return null;
    }
}
