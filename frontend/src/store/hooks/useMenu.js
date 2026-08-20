import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchMenuByResId,
    setActiveResId as dispatchSetActiveResId,
    setActivePlatform as dispatchSetActivePlatform,
    setActiveView as dispatchSetActiveView,
    setActiveBulkMode as setGlobalBulkMode,
    setActiveCategory as setGlobalCategory,
    setActiveSubCategory as setGlobalSubCategory,
    addCategory as dispatchAddCategory,
    insertFullCategory as dispatchInsertFullCategory,
    updateCategory as dispatchUpdateCategory,
    deleteCategory as dispatchDeleteCategory,
    addSubCategory as dispatchAddSubCategory,
    updateSubCategory as dispatchUpdateSubCategory,
    deleteSubCategory as dispatchDeleteSubCategory,
    addItem as dispatchAddItem,
    updateItem as dispatchUpdateItem,
    deleteItem as dispatchDeleteItem,
    moveItem as dispatchMoveItem,
    saveMenuByResId as dispatchSaveMenuByResId,
    syncZomatoMenu as dispatchSyncZomatoMenu,
    syncSwiggyMenu as dispatchSyncSwiggyMenu,
    syncPetpoojaMenu as dispatchSyncPetpoojaMenu,
    addAddonGroup as dispatchAddAddonGroup,
    updateAddonGroup as dispatchUpdateAddonGroup,
    deleteAddonGroup as dispatchDeleteAddonGroup,
    addAddonOption as dispatchAddAddonOption,
    updateAddonOption as dispatchUpdateAddonOption,
    deleteAddonOption as dispatchDeleteAddonOption,
    toggleItemAddon as dispatchToggleItemAddon,
    bulkToggleAddon as dispatchBulkToggleAddon,
    setGlobalSearchQuery as dispatchSetGlobalSearchQuery,
    markMenuUpdatesDone as dispatchMarkMenuUpdatesDone,
    queueAll as dispatchQueueAll,
    queuePriceUpdates as dispatchQueuePriceUpdates,
    queueDescriptionUpdates as dispatchQueueDescriptionUpdates,
    clearPetpoojaHtml as dispatchClearPetpoojaHtml,
    setTaskId as dispatchSetTaskId
} from '../slice/menuSlice';

export const useMenu = () => {
    const dispatch = useDispatch();

    const menuData = useSelector((state) => state.menu.menuData);
    const addonsData = useSelector((state) => state.menu.addonsData);
    const petpoojaHtml = useSelector((state) => state.menu.petpoojaHtml);
    const restaurantName = useSelector((state) => state.menu.restaurantName);
    const {
        activeResId,
        activePlatform,
        activeView,
        activeBulkMode,
        activeCategory,
        activeSubCategory,
        loading,
        isSaving,
        isSyncing,
        error,
        globalSearchQuery,
        updated_menu,
        taskId
    } = useSelector((state) => state.menu);

    const getMenuByResId = useCallback((resId) => {
        dispatch(fetchMenuByResId(resId));
    }, [dispatch]);

    const setActiveBulkMode = useCallback((mode) => dispatch(setGlobalBulkMode(mode)), [dispatch]);
    const setActiveCategory = useCallback((catId) => dispatch(setGlobalCategory(catId)), [dispatch]);
    const setActiveSubCategory = useCallback((subCatId) => dispatch(setGlobalSubCategory(subCatId)), [dispatch]);
    const setGlobalSearchQuery = useCallback((query) => dispatch(dispatchSetGlobalSearchQuery(query)), [dispatch]);

    const addCategory = useCallback((name) => {
        dispatch(dispatchAddCategory(name));
    }, [dispatch]);

    const updateCategory = useCallback((categoryId, data) => {
        dispatch(dispatchUpdateCategory({ categoryId, data }));
    }, [dispatch]);

    const deleteCategory = useCallback((categoryId) => {
        dispatch(dispatchDeleteCategory(categoryId));
    }, [dispatch]);

    const addSubCategory = useCallback((categoryId, name) => {
        dispatch(dispatchAddSubCategory({ categoryId, name }));
    }, [dispatch]);

    const updateSubCategory = useCallback((subCategoryId, data) => {
        dispatch(dispatchUpdateSubCategory({ subCategoryId, data }));
    }, [dispatch]);

    const deleteSubCategory = useCallback((subCategoryId) => {
        dispatch(dispatchDeleteSubCategory(subCategoryId));
    }, [dispatch]);

    const copyCategoryToClipboard = useCallback((category) => {
        try {
            const cleanObj = (obj) => {
                if (!obj) return obj;
                const newObj = { ...obj };
                delete newObj.status;
                if (newObj.sub_category) newObj.sub_category = newObj.sub_category.map(cleanObj);
                if (newObj.items) newObj.items = newObj.items.map(cleanObj);
                if (newObj.variants) newObj.variants = newObj.variants.map(cleanObj);
                return newObj;
            };
            const cleanedCategory = cleanObj(category);
            localStorage.setItem('menuManager_copiedCategory', JSON.stringify(cleanedCategory));
            return true;
        } catch (err) {
            console.error('Failed to copy category', err);
            return false;
        }
    }, []);

    const pasteCategoryFromClipboard = useCallback(() => {
        try {
            const dataStr = localStorage.getItem('menuManager_copiedCategory');
            if (!dataStr) return false;
            const categoryData = JSON.parse(dataStr);
            
            const remapIds = (obj) => {
                if (!obj) return obj;
                const newObj = { ...obj, id: 'temp-' + crypto.randomUUID() };
                if (newObj.sub_category) newObj.sub_category = newObj.sub_category.map(remapIds);
                if (newObj.items) newObj.items = newObj.items.map(remapIds);
                if (newObj.variants) newObj.variants = newObj.variants.map(remapIds);
                return newObj;
            };
            
            const newlyIdMappedCategory = remapIds(categoryData);
            dispatch(dispatchInsertFullCategory(newlyIdMappedCategory));
            return true;
        } catch (err) {
            console.error('Failed to paste category', err);
            return false;
        }
    }, [dispatch]);

    const hasCopiedCategory = typeof window !== 'undefined' && !!localStorage.getItem('menuManager_copiedCategory');

    return {
        // Data States
        menuData,
        addonsData,
        restaurantName,
        activeResId,
        activePlatform,
        activeView,
        activeBulkMode,
        activeCategory,
        activeSubCategory,
        isLoading: loading,
        isSaving,
        isSyncing,
        error,
        updated_menu,

        // Core Layout Setters
        setActiveResId: useCallback((idOrObj) => {
            if (typeof window !== 'undefined') {
                const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
                const platform = typeof idOrObj === 'object' ? idOrObj.platform : null;
                localStorage.setItem('activeResId', id);
                if (platform) localStorage.setItem('activePlatform', platform);
            }
            dispatch(dispatchSetActiveResId(idOrObj));
        }, [dispatch]),
        setActivePlatform: (platform) => dispatch(dispatchSetActivePlatform(platform)),
        setActiveView: (view) => dispatch(dispatchSetActiveView(view)),
        setActiveBulkMode,
        setActiveCategory,
        setActiveSubCategory,
        globalSearchQuery,
        setGlobalSearchQuery,

        // Menu Modifiers (CRUD)
        addCategory,
        updateCategory,
        deleteCategory,
        copyCategoryToClipboard,
        pasteCategoryFromClipboard,
        hasCopiedCategory,
        addSubCategory,
        updateSubCategory,
        deleteSubCategory,

        // Item Modifiers
        addItem: (payload) => {
            if (payload && payload.subCategoryId && payload.item) {
                return dispatch(dispatchAddItem(payload));
            }
            // fallback for legacy calls
            return dispatch(dispatchAddItem({ subCategoryId: arguments[0], item: { name: arguments[1], price: arguments[2] } }));
        },
        updateItem: (itemIdOrPayload, data) => {
            if (typeof itemIdOrPayload === 'object' && itemIdOrPayload !== null && 'itemId' in itemIdOrPayload) {
                return dispatch(dispatchUpdateItem({
                    itemId: itemIdOrPayload.itemId,
                    updates: itemIdOrPayload.updates || itemIdOrPayload.data
                }));
            }
            return dispatch(dispatchUpdateItem({ itemId: itemIdOrPayload, updates: data }));
        },
        deleteItem: (itemId) => {
            if (typeof itemId === 'object' && itemId !== null && 'itemId' in itemId) {
                return dispatch(dispatchDeleteItem(itemId));
            }
            return dispatch(dispatchDeleteItem({ itemId }));
        },
        moveItem: (itemId, targetSubCategoryId) => dispatch(dispatchMoveItem({ itemId, targetSubCategoryId })),
        
        // Addon Modifiers
        addAddonGroup: (id, name, min, max) => dispatch(dispatchAddAddonGroup({ id, name, min, max })),
        updateAddonGroup: (addonId, data) => dispatch(dispatchUpdateAddonGroup({ addonId, data })),
        deleteAddonGroup: (addonId) => dispatch(dispatchDeleteAddonGroup(addonId)),
        addAddonOption: (addonId, option) => dispatch(dispatchAddAddonOption({ addonId, option })),
        updateAddonOption: (addonId, optionId, data) => dispatch(dispatchUpdateAddonOption({ addonId, optionId, data })),
        deleteAddonOption: (addonId, optionId) => dispatch(dispatchDeleteAddonOption({ addonId, optionId })),
        toggleItemAddon: (itemId, addonId) => dispatch(dispatchToggleItemAddon({ itemId, addonId })),
        bulkToggleAddon: (addonId, itemIds, isAttaching) => dispatch(dispatchBulkToggleAddon({ addonId, itemIds, isAttaching })),

        getMenuByResId,
        saveMenuByResId: () => dispatch(dispatchSaveMenuByResId()),
        syncZomatoMenu: (resId) => dispatch(dispatchSyncZomatoMenu(resId)),
        syncSwiggyMenu: (resId) => dispatch(dispatchSyncSwiggyMenu(resId)),
        syncPetpoojaMenu: (resId) => dispatch(dispatchSyncPetpoojaMenu(resId)),
        
        // Swiggy specific actions
        markMenuUpdatesDone: () => dispatch(dispatchMarkMenuUpdatesDone()),
        queueAll: () => dispatch(dispatchQueueAll()),
        queuePriceUpdates: () => dispatch(dispatchQueuePriceUpdates()),
        queueDescriptionUpdates: () => dispatch(dispatchQueueDescriptionUpdates()),
        
        // Petpooja HTML support
        petpoojaHtml,
        clearPetpoojaHtml: () => dispatch(dispatchClearPetpoojaHtml()),
        taskId,
        setTaskId: (id) => dispatch(dispatchSetTaskId(id))
    };
};