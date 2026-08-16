"use client";

import { MenuEditorHeader } from "@/components/global/menu/header";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";
import { useEffect, useRef, Suspense } from "react";
import { Loader2 } from "lucide-react";
import MenuItemList from "@/components/global/menu/item-view/menu-item-list";
import BulkEditorRouter from "@/components/global/menu/bulk-editor-router";
import ImageSidebar from "@/components/global/menu/bulk-editor-router/views/ImageSidebar";
import PetpoojaHTMLModal from "@/components/global/menu/petpooja-html-modal";

const MenuPage = () => {
    const { activeResId, activePlatform, getMenuByResId, saveMenuByResId, isLoading, isSaving, activeCategory, activeSubCategory, menuData, addItem, updateItem, deleteItem, moveItem, activeView, activeBulkMode } = useMenu();
    const fetchedResId = useRef(null);
    const fetchedPlatform = useRef(null);
    const notification = useNotification();

    useEffect(() => {
        if (activeResId && (activeResId !== fetchedResId.current || activePlatform !== fetchedPlatform.current)) {
            fetchedResId.current = activeResId;
            fetchedPlatform.current = activePlatform;
            getMenuByResId({ resId: activeResId, platform: activePlatform });
        }
    }, [activeResId, activePlatform, getMenuByResId]);

    const handleSaveMenu = async () => {
        try {
            await saveMenuByResId();
            notification.success("Menu saved successfully!");
        } catch (error) {
            notification.error(error?.message || "Failed to save menu");
        }
    };

    const activeSubCategoryData = menuData?.find(c => c.id === activeCategory)?.sub_category?.find(s => s.id === activeSubCategory) || null;

    if (isLoading) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50/50">
                <Loader2 className="w-10 h-10 animate-spin text-red-500 mb-4" />
                <p className="text-gray-500 font-medium animate-pulse">Loading menu editor...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-3rem)] bg-white overflow-hidden relative">
            <MenuEditorHeader onSave={handleSaveMenu} isSaving={isSaving} />
            <div className="flex-1 flex overflow-hidden">
                {activeView === "BULK" ? (
                    <BulkEditorRouter
                        activeBulkMode={activeBulkMode}
                        menuData={menuData}
                        updateItem={updateItem}
                        deleteItem={deleteItem}
                        moveItem={moveItem}
                        activeResId={activeResId}
                    />
                ) : (
                    <MenuItemList 
                        activeSubCategoryData={activeSubCategoryData}
                        addItem={addItem}
                        updateCatalogue={updateItem}
                        deleteItem={deleteItem}
                    />
                )}
            </div>
            
            <Suspense fallback={null}>
                <ImageSidebar />
            </Suspense>

            <PetpoojaHTMLModal />
        </div>
    );
};

export default MenuPage;