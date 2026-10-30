"use client";

import { MenuEditorHeader } from "@/components/global/menu/header";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import { useEffect, useRef, useState, Suspense } from "react";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import MenuItemList from "@/components/global/menu/item-view/menu-item-list";
import BulkEditorRouter from "@/components/global/menu/bulk-editor-router";
import ImageSidebar from "@/components/global/menu/bulk-editor-router/views/ImageSidebar";
import PetpoojaUnlockModal from "@/components/global/menu/PetpoojaUnlockModal";

const MenuPage = () => {
    const {
        activeResId,
        activePlatform,
        setActiveResId,
        getMenuByResId,
        saveMenuByResId,
        isLoading,
        isSaving,
        activeCategory,
        activeSubCategory,
        menuData,
        addItem,
        updateItem,
        deleteItem,
        moveItem,
        activeView,
        activeBulkMode,
    } = useMenu();

    const { restaurants: zomatoRestaurants } = useRestaurant();
    const { restaurants: swiggyRestaurants } = useSwiggyRestaurant();

    const fetchedResId = useRef(null);
    const fetchedPlatform = useRef(null);
    const notification = useNotification();

    const [isPetpoojaVerified, setIsPetpoojaVerified] = useState(false);
    const [isCheckingPetpoojaVerification, setIsCheckingPetpoojaVerification] = useState(true);

    useEffect(() => {
        if (!activeResId || activePlatform !== 'petpooja') {
            setIsPetpoojaVerified(true);
            setIsCheckingPetpoojaVerification(false);
            return;
        }

        const localVerified = typeof window !== 'undefined' ? localStorage.getItem(`otp_verified_${activeResId}`) : null;
        if (localVerified === 'true') {
            setIsPetpoojaVerified(true);
            setIsCheckingPetpoojaVerification(false);
            return;
        }

        setIsCheckingPetpoojaVerification(true);
        fetch(`/api/menu/${activeResId}/otp/verify`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.verified) {
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(`otp_verified_${activeResId}`, 'true');
                    }
                    setIsPetpoojaVerified(true);
                } else {
                    setIsPetpoojaVerified(false);
                }
            })
            .catch(() => {
                setIsPetpoojaVerified(false);
            })
            .finally(() => {
                setIsCheckingPetpoojaVerification(false);
            });
    }, [activeResId, activePlatform]);

    useEffect(() => {
        if (activeResId && (activeResId !== fetchedResId.current || activePlatform !== fetchedPlatform.current)) {
            if (activePlatform === 'petpooja' && !isPetpoojaVerified) {
                return;
            }
            fetchedResId.current = activeResId;
            fetchedPlatform.current = activePlatform;
            getMenuByResId({ resId: activeResId, platform: activePlatform });
        }
    }, [activeResId, activePlatform, isPetpoojaVerified, getMenuByResId]);

    const handleSaveMenu = async () => {
        try {
            await saveMenuByResId();
            notification.success("Menu saved successfully!");
        } catch (error) {
            notification.error(error?.message || "Failed to save menu");
        }
    };

    const handleSwitchToOther = () => {
        const zomatoList = Array.isArray(zomatoRestaurants) ? zomatoRestaurants : (zomatoRestaurants?.entities || zomatoRestaurants?.data || []);
        if (zomatoList.length > 0) {
            setActiveResId({ id: zomatoList[0].id, platform: 'zomato' });
            return;
        }
        const swiggyList = Array.isArray(swiggyRestaurants) ? swiggyRestaurants : (swiggyRestaurants?.entities || swiggyRestaurants?.data || []);
        if (swiggyList.length > 0) {
            setActiveResId({ id: swiggyList[0].id, platform: 'swiggy' });
            return;
        }
    };

    const activeSubCategoryData = menuData?.find(c => c.id === activeCategory)?.sub_category?.find(s => s.id === activeSubCategory) || null;

    if (activePlatform === 'petpooja' && isCheckingPetpoojaVerification) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50/50">
                <Loader2 className="w-10 h-10 animate-spin text-purple-600 mb-4" />
                <p className="text-gray-500 font-medium animate-pulse text-sm">Checking Petpooja authorization...</p>
            </div>
        );
    }

    if (activePlatform === 'petpooja' && !isPetpoojaVerified) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-slate-100/70 p-6">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 mb-4 shadow-sm">
                        <Lock className="size-8" />
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider mb-2">
                        <span>🔒</span> Petpooja Outlet Locked
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-1">
                        Authorization Required
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-sm mb-6">
                        Outlet ID <span className="font-mono font-semibold text-slate-900">#{activeResId}</span> is locked. To open and view this Petpooja outlet, verify authorization using CRM Task ID or Admin OTP.
                    </p>
                    <PetpoojaUnlockModal
                        isOpen={true}
                        onClose={() => {}}
                        restaurant={{ id: activeResId, name: `Petpooja Restaurant #${activeResId}` }}
                        onSuccess={() => {
                            setIsPetpoojaVerified(true);
                        }}
                        onSwitchToOther={handleSwitchToOther}
                    />
                </div>
            </div>
        );
    }

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
        </div>
    );
};

export default MenuPage;
