import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { MenuService } from '@/services/menu';

export const fetchMenuByResId = createAsyncThunk(
    'menu/fetchMenuByResId',
    async (arg, { rejectWithValue, getState }) => {
        try {
            const state = getState();
            const resId = typeof arg === 'object' ? arg.resId : arg;
            const platform = typeof arg === 'object' ? arg.platform : state.menu.activePlatform;
            const data = await MenuService.getMenu(resId, platform);
            // Returns the menu payload array and the restaurant configuration information
            return data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch menu');
        }
    }
);

export const syncZomatoMenu = createAsyncThunk(
    'menu/syncZomatoMenu',
    async (resId, { rejectWithValue }) => {
        try {
            const data = await MenuService.getZomatoMenu(resId);
            return data;
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to sync Zomato menu');
        }
    }
);

export const syncSwiggyMenu = createAsyncThunk(
    'menu/syncSwiggyMenu',
    async (resId, { rejectWithValue }) => {
        try {
            const data = await MenuService.syncSwiggyMenu(resId);
            return data;
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to sync Swiggy menu');
        }
    }
);

export const syncPetpoojaMenu = createAsyncThunk(
    'menu/syncPetpoojaMenu',
    async (payload, { rejectWithValue }) => {
        try {
            const resId = typeof payload === 'object' ? payload.resId : payload;
            const queryParams = typeof payload === 'object' ? payload.queryParams : '';
            const data = await MenuService.syncPetpoojaMenu(resId, queryParams);
            return data;
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to sync Petpooja menu');
        }
    }
);

export const syncOwnlyMenu = createAsyncThunk(
    'menu/syncOwnlyMenu',
    async (resId, { rejectWithValue }) => {
        try {
            const data = await MenuService.syncOwnlyMenu(resId);
            return data;
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to sync Ownly menu');
        }
    }
);

export const saveMenuByResId = createAsyncThunk(
    'menu/saveMenuByResId',
    async (_, { getState, rejectWithValue }) => {
        try {
            const { menu } = getState();
            if (!menu.activeResId || !menu.menuData) {
                throw new Error("No active restaurant or menu data to save.");
            }
            const payload = {
                menu: menu.menuData,
                addons: menu.addonsData
            };
            const data = await MenuService.saveMenu(menu.activeResId, payload, menu.activePlatform);
            return data;
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to save menu');
        }
    }
);


const createEmptyUpdatedMenu = () => ({
    categories: [],
    sub_categories: [],
    items: [],
});

const isItemValid = (item) => {
    return Boolean(
        item.name?.trim() &&
        item.base_price !== undefined && item.base_price !== null && item.base_price !== "" &&
        item.description?.trim() &&
        item.is_veg && item.is_veg !== "UNKNOWN"
    );
};

const upsertUpdatedMenuEntry = (entries, entry, fullItem = null) => {
    if (!Array.isArray(entries)) return;

    const itemToValidate = fullItem || entry;
    if ('price' in itemToValidate || 'description' in itemToValidate || 'is_veg' in itemToValidate) {
        if (entry.action === 'create' && !isItemValid(itemToValidate)) {
            const idx = entries.findIndex(i => i.id === entry.id);
            if (idx >= 0) entries.splice(idx, 1);
            return;
        }
    }

    let entryWithStatus = { ...entry, status: "pending" };
    
    // Clean variants: remove is_veg="NONE" from options
    if (entryWithStatus.variants) {
        entryWithStatus.variants = entryWithStatus.variants.map(vg => ({
            ...vg,
            options: (vg.options || []).map(opt => {
                const newOpt = { ...opt };
                if (newOpt.is_veg === "NONE") {
                    delete newOpt.is_veg;
                } else if (fullItem && fullItem.is_veg) {
                     newOpt.is_veg = fullItem.is_veg;
                }
                return newOpt;
            })
        }));
    }

    const existingIndex = entries.findIndex((item) => item.id === entry.id);

    if (existingIndex >= 0) {
        entries[existingIndex] = {
            ...entries[existingIndex],
            ...entryWithStatus,
        };
        return;
    }

    if (entry.action === "create") {
        entries.push({
            ...(fullItem || {}),
            ...entryWithStatus
        });
    } else {
        entries.push(entryWithStatus);
    }
};

const initialState = {
    updated_menu: createEmptyUpdatedMenu(),
    menuData: null,         // Array of categories
    addonsData: [],         // Array of addons/modifier groups
    restaurantName: '',
    activeResId: null,
    activePlatform: null,
    activeView: 'MENU',     // 'MENU' or 'BULK'
    activeBulkMode: 'PRICE', // 'PRICE', 'DESCRIPTION', 'IMAGE'
    activeCategory: null,   // Category ID
    activeSubCategory: null,// Subcategory ID
    isImageSidebarOpen: false,
    activeImageSearchItem: null,
    loading: false,
    isSaving: false,
    isSyncing: false,
    imageUploadStatuses: {}, // { [itemId]: 'uploading' | 'approved' | 'rejected' }
    ticketImageUpdates: {},
    uploadQueue: {
        total: 0,
        completed: 0,
        failed: 0,
        isProcessing: false,
        activeItemId: null,
        items: [],
    },
    error: null,
    globalSearchQuery: "",
    taskId: null,
};

const menuSlice = createSlice({
    name: 'menu',
    initialState,
    reducers: {
        setActiveResId: (state, action) => {
            state.imageUploadStatuses = {};
            if (typeof action.payload === 'object' && action.payload !== null) {
                state.activeResId = action.payload.id;
                if (action.payload.platform) {
                    state.activePlatform = action.payload.platform;
                }
            } else {
                state.activeResId = action.payload;
            }
        },
        setActivePlatform: (state, action) => {
            state.imageUploadStatuses = {};
            state.activePlatform = action.payload;
        },
        setActiveView: (state, action) => {
            state.activeView = action.payload;
        },
        setActiveBulkMode: (state, action) => {
            state.activeBulkMode = action.payload;
        },
        setActiveCategory: (state, action) => {
            state.activeCategory = action.payload;
            state.activeSubCategory = null;
        },
        setActiveSubCategory: (state, action) => {
            state.activeSubCategory = action.payload;
        },
        openImageSidebar: (state, action) => {
            state.isImageSidebarOpen = true;
            state.activeImageSearchItem = action.payload;
        },
        closeImageSidebar: (state) => {
            state.isImageSidebarOpen = false;
            state.activeImageSearchItem = null;
        },
        clearAllImageUploadStatuses: (state) => {
            state.imageUploadStatuses = {};
        },
        setImageUploadStatus: (state, action) => {
            if (!action.payload || (!action.payload.itemId && action.payload.status === null)) {
                state.imageUploadStatuses = {};
                return;
            }
            const { itemId, status, error, fileOrUrl } = action.payload || {};
            if (!itemId) return;
            if (status === null) {
                delete state.imageUploadStatuses[itemId];
            } else if (typeof action.payload === "object" && (error || fileOrUrl)) {
                state.imageUploadStatuses[itemId] = {
                    status,
                    error: error || null,
                    fileOrUrl: fileOrUrl || null,
                };
            } else {
                state.imageUploadStatuses[itemId] = status;
            }
        },
        setTicketImageUpdate: (state, action) => {
            const { ticketId, imageUrl } = action.payload;
            state.ticketImageUpdates[ticketId] = imageUrl;
        },
        clearTicketImageUpdate: (state, action) => {
            const ticketId = action.payload;
            delete state.ticketImageUpdates[ticketId];
        },
        setGlobalSearchQuery: (state, action) => {
            state.globalSearchQuery = action.payload;
        },
        setTaskId: (state, action) => {
            state.taskId = action.payload;
        },

        // --- Upload Queue Reducers ---
        enqueueUploadJob: (state, action) => {
            const { id, itemId, itemName, fileOrUrl } = action.payload;
            if (!state.uploadQueue) {
                state.uploadQueue = { total: 0, completed: 0, failed: 0, isProcessing: false, activeItemId: null, items: [] };
            }
            if (!state.uploadQueue.isProcessing && state.uploadQueue.total === (state.uploadQueue.completed + state.uploadQueue.failed)) {
                state.uploadQueue.total = 1;
                state.uploadQueue.completed = 0;
                state.uploadQueue.failed = 0;
                state.uploadQueue.items = [];
            } else {
                state.uploadQueue.total += 1;
            }
            state.uploadQueue.isProcessing = true;
            state.uploadQueue.items.push({
                id,
                itemId,
                itemName,
                fileOrUrl,
                status: "pending",
                error: null,
            });
        },
        updateUploadJobStatus: (state, action) => {
            if (!state.uploadQueue) return;
            const { id, itemId, status, error } = action.payload;
            const job = state.uploadQueue.items.find((j) => (id ? j.id === id : j.itemId === itemId));
            if (job) {
                job.status = status;
                if (error) job.error = error;
            }
            if (status === "uploading") {
                state.uploadQueue.activeItemId = itemId;
            } else if (status === "completed") {
                state.uploadQueue.completed += 1;
            } else if (status === "failed") {
                state.uploadQueue.failed += 1;
            }

            const doneCount = state.uploadQueue.completed + state.uploadQueue.failed;
            if (doneCount >= state.uploadQueue.total) {
                state.uploadQueue.isProcessing = false;
                state.uploadQueue.activeItemId = null;
            }
        },
        clearUploadQueue: (state) => {
            state.uploadQueue = {
                total: 0,
                completed: 0,
                failed: 0,
                isProcessing: false,
                activeItemId: null,
                items: [],
            };
        },

        clearMenuState: () => initialState,

        // --- Category CRUD Reducers ---
        addCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            if (!Array.isArray(state.menuData)) state.menuData = [];
            const newCategory = {
                id: 'temp-' + crypto.randomUUID(), // Generates fallback unique strings
                name: action.payload,
                sub_category: [],
                items: []
            };
            state.menuData.push(newCategory);
            upsertUpdatedMenuEntry(state.updated_menu.categories, { id: newCategory.id, name: newCategory.name, action: "create" });
        },
        insertFullCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            if (!Array.isArray(state.menuData)) state.menuData = [];

            // The payload is the fully formed category object with new temp- IDs generated
            // We just need to append it.
            state.menuData.push(action.payload);
        },
        updateCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const { categoryId, data } = action.payload;
            const category = state.menuData?.find(cat => cat.id === categoryId);
            if (category) {
                const updateTag = String(categoryId).startsWith('temp-') ? category.temp_id : `update-${categoryId}`;
                Object.assign(category, { ...data, temp_id: updateTag });
                const existingEntry = state.updated_menu.categories.find(entry => entry.id === categoryId);
                upsertUpdatedMenuEntry(state.updated_menu.categories, { id: categoryId, ...data, action: existingEntry?.action || (String(categoryId).startsWith('temp-') ? "create" : "update") });
            }
        },
        deleteCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const categoryId = action.payload;
            if (String(categoryId).startsWith('temp-')) {
                state.menuData = state.menuData?.filter(cat => cat.id !== categoryId) || [];
                state.updated_menu.categories = state.updated_menu.categories.filter(entry => entry.id !== categoryId);
                state.updated_menu.items = state.updated_menu.items.filter(entry => entry.categoryId !== categoryId);
            } else {
                upsertUpdatedMenuEntry(state.updated_menu.categories, { id: categoryId, action: "delete" });
                const category = state.menuData?.find(cat => cat.id === categoryId);
                if (category) {
                    category.status = 'delete';
                    category.temp_id = `delete-${categoryId}`;
                    category.sub_category?.forEach(sub => {
                        sub.status = 'delete';
                        sub.temp_id = `delete-${sub.id}`;
                        sub.items?.forEach(item => {
                            item.status = 'delete';
                            item.temp_id = `delete-${item.id}`;
                            item.variants?.forEach(variant => variant.status = 'delete');
                            if (state.activePlatform === 'ownly' && !String(item.id).startsWith('temp-')) {
                                upsertUpdatedMenuEntry(state.updated_menu.items, {
                                    id: item.id,
                                    name: item.name,
                                    categoryId: category.id,
                                    categoryName: category.name,
                                    subCategoryId: sub.id,
                                    subCategoryName: sub.name,
                                    action: "delete",
                                });
                            }
                        });
                    });
                }
            }
            if (state.activeCategory === categoryId) {
                state.activeCategory = null;
                state.activeSubCategory = null;
            }
        },

        // --- Subcategory CRUD Reducers ---
        addSubCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const { categoryId, name } = action.payload;
            const category = state.menuData?.find(cat => cat.id === categoryId);
            if (category) {
                if (!category.sub_category) category.sub_category = [];
                const newSubId = 'temp-' + crypto.randomUUID();
                category.sub_category.push({
                    id: newSubId,
                    name: name,
                    items: []
                });
                upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: newSubId, categoryId, name, action: "create" });
            }
        },
        updateSubCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const { subCategoryId, data } = action.payload;
            state.menuData?.forEach(cat => {
                const sub = cat.sub_category?.find(s => s.id === subCategoryId);
                if (sub) {
                    const updateTag = String(subCategoryId).startsWith('temp-') ? sub.temp_id : `update-${subCategoryId}`;
                    Object.assign(sub, { ...data, temp_id: updateTag });
                    const existingEntry = state.updated_menu.sub_categories.find(entry => entry.id === subCategoryId);
                    upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: subCategoryId, categoryId: cat.id, ...data, action: existingEntry?.action || (String(subCategoryId).startsWith('temp-') ? "create" : "update") });
                }
            });
        },
        deleteSubCategory: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const subCategoryId = action.payload;
            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    if (String(subCategoryId).startsWith('temp-')) {
                        cat.sub_category = cat.sub_category.filter(s => s.id !== subCategoryId);
                        state.updated_menu.sub_categories = state.updated_menu.sub_categories.filter(entry => entry.id !== subCategoryId);
                        state.updated_menu.items = state.updated_menu.items.filter(entry => entry.subCategoryId !== subCategoryId);
                    } else {
                        upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: subCategoryId, categoryId: cat.id, action: "delete" });
                        const sub = cat.sub_category.find(s => s.id === subCategoryId);
                        if (sub) {
                            sub.status = 'delete';
                            sub.temp_id = `delete-${subCategoryId}`;
                            sub.items?.forEach(item => {
                                item.status = 'delete';
                                item.temp_id = `delete-${item.id}`;
                                item.variants?.forEach(variant => variant.status = 'delete');
                                if (state.activePlatform === 'ownly' && !String(item.id).startsWith('temp-')) {
                                    upsertUpdatedMenuEntry(state.updated_menu.items, {
                                        id: item.id,
                                        name: item.name,
                                        categoryId: cat.id,
                                        categoryName: cat.name,
                                        subCategoryId: sub.id,
                                        subCategoryName: sub.name,
                                        action: "delete",
                                    });
                                }
                            });
                        }
                    }
                }
            });
            if (state.activeSubCategory === subCategoryId) {
                state.activeSubCategory = null;
            }
        },
        // --- Item CRUD Reducers ---
        addItem: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const { subCategoryId, item } = action.payload;
            state.menuData?.forEach(cat => {
                const sub = cat.sub_category?.find(s => s.id === subCategoryId);
                if (sub) {
                    if (!sub.items) sub.items = [];
                    const newItemId = item.id || ('temp-' + crypto.randomUUID());
                    const priceVal = Number(item.base_price !== undefined && item.base_price !== null && item.base_price !== "" 
                        ? item.base_price 
                        : (item.price ?? 0));
                    const newItem = { 
                        ...item, 
                        id: newItemId,
                        price: priceVal,
                        base_price: priceVal,
                        min_price: priceVal,
                        max_price: priceVal
                    };
                    sub.items.push(newItem);
                    upsertUpdatedMenuEntry(state.updated_menu.items, { ...newItem, id: newItemId, categoryId: cat.id, categoryName: cat.name, subCategoryId, subCategoryName: sub.name, action: "create" });
                    
                    // Auto-queue parent category and subcategory if they are temp
                    if (String(cat.id).startsWith('temp-')) {
                        const existingCat = state.updated_menu.categories.find(entry => entry.id === cat.id);
                        upsertUpdatedMenuEntry(state.updated_menu.categories, {
                            id: cat.id,
                            name: cat.name,
                            action: existingCat?.action || "create"
                        });
                    }
                    if (String(sub.id).startsWith('temp-')) {
                        const existingSub = state.updated_menu.sub_categories.find(entry => entry.id === sub.id);
                        upsertUpdatedMenuEntry(state.updated_menu.sub_categories, {
                            id: sub.id,
                            categoryId: cat.id,
                            name: sub.name,
                            action: existingSub?.action || "create"
                        });
                    }
                }
            });
        },
        updateItem: (state, action) => {
            const { itemId, updates } = action.payload;
            const safeUpdates = { ...updates };
            if (state.activePlatform === 'petpooja') {
                delete safeUpdates.base_price;
                delete safeUpdates.price;
            } else {
                // Ensure base_price, price, min_price, max_price are always synchronized
                if (safeUpdates.base_price !== undefined && safeUpdates.base_price !== null && safeUpdates.base_price !== "") {
                    const numPrice = Number(safeUpdates.base_price);
                    safeUpdates.base_price = numPrice;
                    safeUpdates.price = numPrice;
                    safeUpdates.min_price = numPrice;
                    safeUpdates.max_price = numPrice;
                } else if (safeUpdates.price !== undefined && safeUpdates.price !== null && safeUpdates.price !== "") {
                    const numPrice = Number(safeUpdates.price);
                    safeUpdates.price = numPrice;
                    safeUpdates.base_price = numPrice;
                    safeUpdates.min_price = numPrice;
                    safeUpdates.max_price = numPrice;
                }
            }
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    const itemIndex = sub.items?.findIndex(i => i.id === itemId);
                    if (itemIndex !== undefined && itemIndex !== -1) {
                        const updateTag = String(itemId).startsWith('temp-') ? sub.items[itemIndex].temp_id : `update-${itemId}`;
                        sub.items[itemIndex] = { ...sub.items[itemIndex], ...safeUpdates, temp_id: updateTag };
                        const existingEntry = state.updated_menu.items.find(entry => entry.id === itemId);
                        upsertUpdatedMenuEntry(state.updated_menu.items, { ...safeUpdates, id: itemId, categoryId: cat.id, categoryName: cat.name, subCategoryId: sub.id, subCategoryName: sub.name, action: existingEntry?.action || (String(itemId).startsWith('temp-') ? "create" : "update") }, sub.items[itemIndex]);
                    }
                });
            });
        },
        addImage: (state, action) => {
            const { itemId, media } = action.payload;
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    const itemIndex = sub.items?.findIndex(i => i.id === itemId);
                    if (itemIndex !== undefined && itemIndex !== -1) {
                        sub.items[itemIndex].media = media;
                        const mediaObj = Array.isArray(media) ? media[0] : media;
                        const url = typeof mediaObj === 'string' ? mediaObj : (mediaObj?.url || mediaObj?.utl);
                        const imageId = mediaObj?.imageId || mediaObj?.id || null;
                        const existingEntry = state.updated_menu.items.find((entry) => entry.id === itemId);
                        const updateTag = String(itemId).startsWith('temp-') ? sub.items[itemIndex].temp_id : `update-${itemId}`;
                        sub.items[itemIndex].temp_id = updateTag;
                        upsertUpdatedMenuEntry(state.updated_menu.items, {
                            id: itemId,
                            categoryId: cat.id,
                            categoryName: cat.name,
                            subCategoryId: sub.id,
                            subCategoryName: sub.name,
                            image_url: url,
                            image_id: imageId,
                            action: existingEntry?.action || "update",
                        });
                    }
                });
            });
        },
        deleteItem: (state, action) => {
            if (state.activePlatform === 'petpooja') return;
            const { itemId } = action.payload;
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    if (sub.items) {
                        if (String(itemId).startsWith('temp-')) {
                            sub.items = sub.items.filter(i => i.id !== itemId);
                            state.updated_menu.items = state.updated_menu.items.filter(entry => entry.id !== itemId);
                        } else {
                            upsertUpdatedMenuEntry(state.updated_menu.items, { id: itemId, categoryId: cat.id, categoryName: cat.name, subCategoryId: sub.id, subCategoryName: sub.name, action: "delete" });
                            const item = sub.items.find(i => i.id === itemId);
                            if (item) {
                                item.status = 'delete';
                                item.variants?.forEach(variant => variant.status = 'delete');
                            }
                        }
                    }
                });
            });
        },
        moveItem: (state, action) => {
            const { itemId, sourceSubCategoryId, targetSubCategoryId } = action.payload;
            if (sourceSubCategoryId === targetSubCategoryId) return;

            let itemToMove = null;
            // 1. Find and remove from source
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    if (sub.id === sourceSubCategoryId && sub.items) {
                        const index = sub.items.findIndex(i => i.id === itemId);
                        if (index !== -1) {
                            itemToMove = sub.items[index];
                            sub.items.splice(index, 1);
                        }
                    }
                });
            });

            // 2. Add to target
            if (itemToMove) {
                state.menuData?.forEach(cat => {
                    cat.sub_category?.forEach(sub => {
                        if (sub.id === targetSubCategoryId) {
                            if (!sub.items) sub.items = [];
                            sub.items.push(itemToMove);
                        }
                    });
                });
            }
        },
        moveSubCategory: (state, action) => {
            const { subCategoryId, sourceCategoryId, targetCategoryId } = action.payload;
            if (sourceCategoryId === targetCategoryId) return;

            let subToMove = null;
            // 1. Remove from source
            const sourceCat = state.menuData?.find(c => c.id === sourceCategoryId);
            if (sourceCat && sourceCat.sub_category) {
                const index = sourceCat.sub_category.findIndex(s => s.id === subCategoryId);
                if (index !== -1) {
                    subToMove = sourceCat.sub_category[index];
                    sourceCat.sub_category.splice(index, 1);
                }
            }

            // 2. Add to target
            if (subToMove) {
                const targetCat = state.menuData?.find(c => c.id === targetCategoryId);
                if (targetCat) {
                    if (!targetCat.sub_category) targetCat.sub_category = [];
                    targetCat.sub_category.push(subToMove);
                }
            }
        },
        bulkMergeCategories: (state, action) => {
            const { categoryIds, targetCategoryId } = action.payload;
            if (!categoryIds?.length || !targetCategoryId) return;

            const targetCat = state.menuData?.find(c => c.id === targetCategoryId);
            if (!targetCat) return;

            state.menuData?.forEach(cat => {
                if (categoryIds.includes(cat.id) && cat.id !== targetCategoryId) {
                    if (cat.sub_category && cat.sub_category.length > 0) {
                        if (!targetCat.sub_category) targetCat.sub_category = [];
                        cat.sub_category.forEach(sub => {
                            sub.categoryId = targetCat.id;
                            sub.category_id = targetCat.id;
                            sub.categoryName = targetCat.name;
                            const subUpdateTag = String(sub.id).startsWith('temp-') ? sub.temp_id : `update-${sub.id}`;
                            sub.temp_id = subUpdateTag;

                            if (state.updated_menu.sub_categories) {
                                const existingSubEntry = state.updated_menu.sub_categories.find(entry => entry.id === sub.id);
                                upsertUpdatedMenuEntry(state.updated_menu.sub_categories, {
                                    id: sub.id,
                                    name: sub.name,
                                    categoryId: targetCat.id,
                                    categoryName: targetCat.name,
                                    action: existingSubEntry?.action || (String(sub.id).startsWith('temp-') ? "create" : "update"),
                                });
                            }

                            sub.items?.forEach(item => {
                                item.categoryId = targetCat.id;
                                item.category_id = targetCat.id;
                                item.categoryName = targetCat.name;
                                item.category = { id: targetCat.id, name: targetCat.name, providerId: targetCat.providerId || targetCat.id };
                                const itemUpdateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                                item.temp_id = itemUpdateTag;

                                const existingItemEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                                upsertUpdatedMenuEntry(state.updated_menu.items, {
                                    id: item.id,
                                    name: item.name,
                                    price: item.price ?? item.base_price,
                                    base_price: item.base_price ?? item.price,
                                    categoryId: targetCat.id,
                                    categoryName: targetCat.name,
                                    category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                                    subCategoryId: sub.id,
                                    subCategoryName: sub.name,
                                    subcategory: { id: sub.id, name: sub.name, providerId: sub.id },
                                    action: existingItemEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                                }, item);
                            });
                        });
                        targetCat.sub_category.push(...cat.sub_category);
                    }
                    if (String(cat.id).startsWith('temp-')) {
                        state.menuData = state.menuData.filter(c => c.id !== cat.id);
                    } else {
                        cat.status = 'delete';
                        if (state.updated_menu.categories) {
                            upsertUpdatedMenuEntry(state.updated_menu.categories, { id: cat.id, action: "delete" });
                        }
                    }
                }
            });
        },
        bulkMergeSubCategories: (state, action) => {
            const { subCategoryIds, targetSubCategoryId } = action.payload;
            if (!subCategoryIds?.length || !targetSubCategoryId) return;

            let targetSub = null;
            let targetCat = null;
            state.menuData?.forEach(cat => {
                const found = cat.sub_category?.find(s => s.id === targetSubCategoryId);
                if (found) {
                    targetSub = found;
                    targetCat = cat;
                }
            });
            if (!targetSub || !targetCat) return;

            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        const sub = cat.sub_category[i];
                        if (subCategoryIds.includes(sub.id) && sub.id !== targetSubCategoryId) {
                            if (sub.items && sub.items.length > 0) {
                                if (!targetSub.items) targetSub.items = [];
                                sub.items.forEach(item => {
                                    item.categoryId = targetCat.id;
                                    item.category_id = targetCat.id;
                                    item.categoryName = targetCat.name;
                                    item.category = { id: targetCat.id, name: targetCat.name, providerId: targetCat.providerId || targetCat.id };
                                    item.subCategoryId = targetSub.id;
                                    item.sub_category_id = targetSub.id;
                                    item.subCategoryName = targetSub.name;
                                    item.subcategory = { id: targetSub.id, name: targetSub.name, providerId: targetSub.providerId || targetSub.id };

                                    const itemUpdateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                                    item.temp_id = itemUpdateTag;

                                    const existingItemEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                                    upsertUpdatedMenuEntry(state.updated_menu.items, {
                                        id: item.id,
                                        name: item.name,
                                        price: item.price ?? item.base_price,
                                        base_price: item.base_price ?? item.price,
                                        categoryId: targetCat.id,
                                        categoryName: targetCat.name,
                                        category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                                        subCategoryId: targetSub.id,
                                        subCategoryName: targetSub.name,
                                        subcategory: { id: targetSub.id, name: targetSub.name, providerId: targetSub.id },
                                        action: existingItemEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                                    }, item);
                                });
                                targetSub.items.push(...sub.items);
                            }
                            if (String(sub.id).startsWith('temp-')) {
                                cat.sub_category.splice(i, 1);
                            } else {
                                sub.status = 'delete';
                                if (state.updated_menu.sub_categories) {
                                    upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: sub.id, action: "delete" });
                                }
                            }
                        }
                    }
                }
            });
        },
        bulkMergeCategoriesIntoNewName: (state, action) => {
            const { categoryIds, newName } = action.payload;
            if (!categoryIds?.length || categoryIds.length < 2 || !newName?.trim()) return;

            // Pick the first one as the target
            const targetId = categoryIds[0];
            const targetCat = state.menuData?.find(c => c.id === targetId);
            if (!targetCat) return;

            // Rename target
            targetCat.name = newName.trim();
            const catUpdateTag = String(targetCat.id).startsWith('temp-') ? targetCat.temp_id : `update-${targetCat.id}`;
            targetCat.temp_id = catUpdateTag;
            if (state.updated_menu.categories) {
                const existingCatEntry = state.updated_menu.categories.find(entry => entry.id === targetCat.id);
                upsertUpdatedMenuEntry(state.updated_menu.categories, {
                    id: targetCat.id,
                    name: targetCat.name,
                    action: existingCatEntry?.action || (String(targetCat.id).startsWith('temp-') ? "create" : "update"),
                });
            }

            // Merge the rest into target
            state.menuData?.forEach(cat => {
                if (categoryIds.includes(cat.id) && cat.id !== targetId) {
                    if (cat.sub_category && cat.sub_category.length > 0) {
                        if (!targetCat.sub_category) targetCat.sub_category = [];

                        cat.sub_category.forEach(sub => {
                            sub.categoryId = targetCat.id;
                            sub.category_id = targetCat.id;
                            sub.categoryName = targetCat.name;
                            const subUpdateTag = String(sub.id).startsWith('temp-') ? sub.temp_id : `update-${sub.id}`;
                            sub.temp_id = subUpdateTag;

                            const existingSub = targetCat.sub_category.find(s =>
                                s.name?.toLowerCase().trim() === sub.name?.toLowerCase().trim() &&
                                s.status !== 'delete' && s.status !== 'deleted'
                            );

                            const destinationSub = existingSub || sub;

                            if (sub.items && sub.items.length > 0) {
                                if (!destinationSub.items) destinationSub.items = [];
                                sub.items.forEach(item => {
                                    item.categoryId = targetCat.id;
                                    item.category_id = targetCat.id;
                                    item.categoryName = targetCat.name;
                                    item.category = { id: targetCat.id, name: targetCat.name, providerId: targetCat.id };
                                    item.subCategoryId = destinationSub.id;
                                    item.sub_category_id = destinationSub.id;
                                    item.subCategoryName = destinationSub.name;
                                    item.subcategory = { id: destinationSub.id, name: destinationSub.name, providerId: destinationSub.id };

                                    const itemUpdateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                                    item.temp_id = itemUpdateTag;

                                    const existingItemEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                                    upsertUpdatedMenuEntry(state.updated_menu.items, {
                                        id: item.id,
                                        name: item.name,
                                        price: item.price ?? item.base_price,
                                        base_price: item.base_price ?? item.price,
                                        categoryId: targetCat.id,
                                        categoryName: targetCat.name,
                                        category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                                        subCategoryId: destinationSub.id,
                                        subCategoryName: destinationSub.name,
                                        subcategory: { id: destinationSub.id, name: destinationSub.name, providerId: destinationSub.id },
                                        action: existingItemEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                                    }, item);

                                    if (existingSub) {
                                        const duplicateItem = existingSub.items.find(i =>
                                            i.name?.toLowerCase().trim() === item.name?.toLowerCase().trim() &&
                                            i.status !== 'delete' && i.status !== 'deleted'
                                        );
                                        if (!duplicateItem) {
                                            existingSub.items.push(item);
                                        }
                                    }
                                });
                            }

                            if (!existingSub) {
                                targetCat.sub_category.push(sub);
                            }
                        });
                    }
                    if (String(cat.id).startsWith('temp-')) {
                        state.menuData = state.menuData.filter(c => c.id !== cat.id);
                    } else {
                        cat.status = 'delete';
                        if (state.updated_menu.categories) {
                            upsertUpdatedMenuEntry(state.updated_menu.categories, { id: cat.id, action: "delete" });
                        }
                    }
                }
            });
        },
        bulkMergeSubCategoriesIntoNewName: (state, action) => {
            const { subCategoryIds, newName } = action.payload;
            if (!subCategoryIds?.length || subCategoryIds.length < 2 || !newName?.trim()) return;

            // Pick the first one as the target
            const targetId = subCategoryIds[0];
            let targetSub = null;
            let targetCat = null;
            state.menuData?.forEach(cat => {
                const found = cat.sub_category?.find(s => s.id === targetId);
                if (found) {
                    targetSub = found;
                    targetCat = cat;
                }
            });
            if (!targetSub || !targetCat) return;

            // Rename target
            targetSub.name = newName.trim();
            const subUpdateTag = String(targetSub.id).startsWith('temp-') ? targetSub.temp_id : `update-${targetSub.id}`;
            targetSub.temp_id = subUpdateTag;
            if (state.updated_menu.sub_categories) {
                const existingSubEntry = state.updated_menu.sub_categories.find(entry => entry.id === targetSub.id);
                upsertUpdatedMenuEntry(state.updated_menu.sub_categories, {
                    id: targetSub.id,
                    name: targetSub.name,
                    categoryId: targetCat.id,
                    categoryName: targetCat.name,
                    action: existingSubEntry?.action || (String(targetSub.id).startsWith('temp-') ? "create" : "update"),
                });
            }

            // Merge the rest into target
            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        const sub = cat.sub_category[i];
                        if (subCategoryIds.includes(sub.id) && sub.id !== targetId) {
                            if (sub.items && sub.items.length > 0) {
                                if (!targetSub.items) targetSub.items = [];

                                sub.items.forEach(item => {
                                    item.categoryId = targetCat.id;
                                    item.category_id = targetCat.id;
                                    item.categoryName = targetCat.name;
                                    item.category = { id: targetCat.id, name: targetCat.name, providerId: targetCat.id };
                                    item.subCategoryId = targetSub.id;
                                    item.sub_category_id = targetSub.id;
                                    item.subCategoryName = targetSub.name;
                                    item.subcategory = { id: targetSub.id, name: targetSub.name, providerId: targetSub.id };

                                    const itemUpdateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                                    item.temp_id = itemUpdateTag;

                                    const existingItemEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                                    upsertUpdatedMenuEntry(state.updated_menu.items, {
                                        id: item.id,
                                        name: item.name,
                                        price: item.price ?? item.base_price,
                                        base_price: item.base_price ?? item.price,
                                        categoryId: targetCat.id,
                                        categoryName: targetCat.name,
                                        category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                                        subCategoryId: targetSub.id,
                                        subCategoryName: targetSub.name,
                                        subcategory: { id: targetSub.id, name: targetSub.name, providerId: targetSub.id },
                                        action: existingItemEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                                    }, item);

                                    const existingItem = targetSub.items.find(i =>
                                        i.name?.toLowerCase().trim() === item.name?.toLowerCase().trim() &&
                                        i.status !== 'delete' && i.status !== 'deleted'
                                    );
                                    if (!existingItem) {
                                        targetSub.items.push(item);
                                    }
                                });
                            }
                            if (String(sub.id).startsWith('temp-')) {
                                cat.sub_category.splice(i, 1);
                            } else {
                                sub.status = 'delete';
                                if (state.updated_menu.sub_categories) {
                                    upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: sub.id, action: "delete" });
                                }
                            }
                        }
                    }
                }
            });
        },
        bulkMoveItems: (state, action) => {
            const { itemIds, targetSubCategoryId } = action.payload;
            if (!itemIds?.length || !targetSubCategoryId) return;

            let targetCat = null;
            let targetSub = null;
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    if (sub.id === targetSubCategoryId) {
                        targetCat = cat;
                        targetSub = sub;
                    }
                });
            });

            if (!targetSub || !targetCat) return;

            const itemsToMove = [];

            // 1. Remove from all sources
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    if (sub.items) {
                        for (let i = sub.items.length - 1; i >= 0; i--) {
                            if (itemIds.includes(sub.items[i].id)) {
                                itemsToMove.push(sub.items[i]);
                                sub.items.splice(i, 1);
                            }
                        }
                    }
                });
            });

            // 2. Add to target and update category/subcategory IDs + mark updated
            if (itemsToMove.length > 0) {
                if (!targetSub.items) targetSub.items = [];
                itemsToMove.forEach(item => {
                    item.categoryId = targetCat.id;
                    item.category_id = targetCat.id;
                    item.categoryName = targetCat.name;
                    item.category = {
                        id: targetCat.id,
                        name: targetCat.name,
                        providerId: targetCat.providerId || targetCat.id,
                    };
                    item.subCategoryId = targetSub.id;
                    item.sub_category_id = targetSub.id;
                    item.subCategoryName = targetSub.name;
                    item.subcategory = {
                        id: targetSub.id,
                        name: targetSub.name,
                        providerId: targetSub.providerId || targetSub.id,
                    };

                    const updateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                    item.temp_id = updateTag;

                    const existingEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                    upsertUpdatedMenuEntry(state.updated_menu.items, {
                        id: item.id,
                        name: item.name,
                        price: item.price ?? item.base_price,
                        base_price: item.base_price ?? item.price,
                        categoryId: targetCat.id,
                        categoryName: targetCat.name,
                        category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                        subCategoryId: targetSub.id,
                        subCategoryName: targetSub.name,
                        subcategory: { id: targetSub.id, name: targetSub.name, providerId: targetSub.id },
                        action: existingEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                    }, item);
                });
                targetSub.items.push(...itemsToMove);
            }
        },
        bulkMoveSubCategories: (state, action) => {
            const { subCategoryIds, targetCategoryId } = action.payload;
            if (!subCategoryIds?.length || !targetCategoryId) return;

            const targetCat = state.menuData?.find(c => c.id === targetCategoryId);
            if (!targetCat) return;

            const subsToMove = [];

            // 1. Remove from all sources
            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        if (subCategoryIds.includes(cat.sub_category[i].id)) {
                            subsToMove.push(cat.sub_category[i]);
                            cat.sub_category.splice(i, 1);
                        }
                    }
                }
            });

            // 2. Add to target and update category references
            if (subsToMove.length > 0) {
                if (!targetCat.sub_category) targetCat.sub_category = [];
                subsToMove.forEach(sub => {
                    sub.categoryId = targetCat.id;
                    sub.category_id = targetCat.id;
                    sub.categoryName = targetCat.name;
                    const subUpdateTag = String(sub.id).startsWith('temp-') ? sub.temp_id : `update-${sub.id}`;
                    sub.temp_id = subUpdateTag;

                    const existingSubEntry = state.updated_menu.sub_categories?.find(entry => entry.id === sub.id);
                    if (state.updated_menu.sub_categories) {
                        upsertUpdatedMenuEntry(state.updated_menu.sub_categories, {
                            id: sub.id,
                            name: sub.name,
                            categoryId: targetCat.id,
                            categoryName: targetCat.name,
                            action: existingSubEntry?.action || (String(sub.id).startsWith('temp-') ? "create" : "update"),
                        });
                    }

                    // Update all items inside sub to have targetCat's categoryId & categoryName
                    sub.items?.forEach(item => {
                        item.categoryId = targetCat.id;
                        item.category_id = targetCat.id;
                        item.categoryName = targetCat.name;
                        item.category = { id: targetCat.id, name: targetCat.name, providerId: targetCat.id };
                        const itemUpdateTag = String(item.id).startsWith('temp-') ? item.temp_id : `update-${item.id}`;
                        item.temp_id = itemUpdateTag;

                        const existingItemEntry = state.updated_menu.items.find(entry => entry.id === item.id);
                        upsertUpdatedMenuEntry(state.updated_menu.items, {
                            id: item.id,
                            name: item.name,
                            price: item.price ?? item.base_price,
                            base_price: item.base_price ?? item.price,
                            categoryId: targetCat.id,
                            categoryName: targetCat.name,
                            category: { id: targetCat.id, name: targetCat.name, providerId: targetCat.id },
                            subCategoryId: sub.id,
                            subCategoryName: sub.name,
                            subcategory: { id: sub.id, name: sub.name, providerId: sub.id },
                            action: existingItemEntry?.action || (String(item.id).startsWith('temp-') ? "create" : "update"),
                        }, item);
                    });
                });
                targetCat.sub_category.push(...subsToMove);
            }
        },
        bulkMakeSubCategoriesAsCategories: (state, action) => {
            const { subCategoryIds } = action.payload;
            if (!subCategoryIds?.length) return;

            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        const sub = cat.sub_category[i];
                        if (subCategoryIds.includes(sub.id)) {
                            // Create new Category with a subcategory of the same name
                            const newCategory = {
                                id: 'temp-' + crypto.randomUUID(),
                                name: sub.name,
                                sub_category: [{
                                    id: 'temp-' + crypto.randomUUID(),
                                    name: sub.name,
                                    items: sub.items || []
                                }],
                                items: []
                            };

                            state.menuData.push(newCategory);

                            // Remove the old subcategory
                            if (String(sub.id).startsWith('temp-')) {
                                cat.sub_category.splice(i, 1);
                            } else {
                                sub.status = 'delete';
                            }
                        }
                    }
                }
            });
        },
        // --- Addon CRUD Reducers ---
        addAddonGroup: (state, action) => {
            if (!Array.isArray(state.addonsData)) state.addonsData = [];
            const newAddon = {
                id: action.payload.id || 'temp-' + crypto.randomUUID(),
                name: action.payload.name || 'New Addon',
                is_compulsory: false,
                min: action.payload.min || 0,
                max: action.payload.max || 1,
                allow_multiple: false,
                max_per_item: 1,
                options: []
            };
            state.addonsData.push(newAddon);
        },
        updateAddonGroup: (state, action) => {
            const { addonId, data } = action.payload;
            const addon = state.addonsData?.find(a => a.id === addonId);
            if (addon) {
                Object.assign(addon, data);
            }
        },
        deleteAddonGroup: (state, action) => {
            const addonId = action.payload;
            state.addonsData = state.addonsData?.filter(a => a.id !== addonId) || [];
            (state.menuData || []).forEach(cat => {
                (cat.sub_category || []).forEach(sub => {
                    (sub.items || []).forEach(item => {
                        if (Array.isArray(item.addons)) {
                            item.addons = item.addons.filter(id => id !== addonId);
                        }
                    });
                });
            });
        },
        deleteAllAddons: (state) => {
            state.addonsData = [];
            (state.menuData || []).forEach(cat => {
                (cat.sub_category || []).forEach(sub => {
                    (sub.items || []).forEach(item => {
                        item.addons = [];
                        if (item.addon_groups) item.addon_groups = [];
                        if (item.addonGroups) item.addonGroups = [];
                    });
                });
            });
        },
        addAddonOption: (state, action) => {
            const { addonId, option } = action.payload;
            const addon = state.addonsData?.find(a => a.id === addonId);
            if (addon) {
                if (!addon.options) addon.options = [];
                addon.options.push({
                    id: 'temp-' + crypto.randomUUID(),
                    name: option.name || '',
                    price: option.price || 0,
                    is_default: option.is_default || false,
                    is_veg: option.is_veg || 'VEG'
                });
            }
        },
        updateAddonOption: (state, action) => {
            const { addonId, optionId, data } = action.payload;
            const addon = state.addonsData?.find(a => a.id === addonId);
            if (addon && addon.options) {
                const opt = addon.options.find(o => o.id === optionId);
                if (opt) {
                    Object.assign(opt, data);
                }
            }
        },
        deleteAddonOption: (state, action) => {
            const { addonId, optionId } = action.payload;
            const addon = state.addonsData?.find(a => a.id === addonId);
            if (addon && addon.options) {
                addon.options = addon.options.filter(o => o.id !== optionId);
            }
        },
        toggleItemAddon: (state, action) => {
            const { itemId, addonId } = action.payload;
            let itemToUpdate = null;
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    const found = sub.items?.find(item => item.id === itemId);
                    if (found) itemToUpdate = found;
                });
            });

            if (itemToUpdate) {
                if (!itemToUpdate.addons) itemToUpdate.addons = [];
                const idx = itemToUpdate.addons.indexOf(addonId);
                if (idx > -1) {
                    itemToUpdate.addons.splice(idx, 1);
                } else {
                    itemToUpdate.addons.push(addonId);
                }
            }
        },

        markMenuUpdatesDone: (state) => {
            ["categories", "sub_categories", "items"].forEach(key => {
                state.updated_menu[key].forEach(entry => {
                    if (entry.status === "queued" || entry.status === "pending") {
                        entry.status = "done";
                    }
                });
            });
        },
        queueAll: (state) => {
            state.menuData?.forEach(c => {
                const existingEntry = state.updated_menu.categories.find(entry => entry.id === c.id);
                upsertUpdatedMenuEntry(state.updated_menu.categories, {
                    id: c.id,
                    name: c.name,
                    action: existingEntry?.action === "create" ? "create" : (String(c.id).startsWith('temp-') ? "create" : "update")
                });

                c.sub_category?.forEach(s => {
                    const existingSub = state.updated_menu.sub_categories.find(entry => entry.id === s.id);
                    upsertUpdatedMenuEntry(state.updated_menu.sub_categories, {
                        id: s.id,
                        categoryId: c.id,
                        name: s.name,
                        action: existingSub?.action === "create" ? "create" : (String(s.id).startsWith('temp-') ? "create" : "update")
                    });

                    s.items?.forEach(i => {
                        const existingItem = state.updated_menu.items.find(entry => entry.id === i.id);
                        const cleanedVariants = (i.variants || []).map(vg => ({
                            ...vg,
                            options: (vg.options || []).map(opt => {
                                const newOpt = { ...opt };
                                delete newOpt.is_veg;
                                return newOpt;
                            })
                        }));
                        
                        upsertUpdatedMenuEntry(state.updated_menu.items, {
                            id: i.id,
                            categoryId: c.id,
                            categoryName: c.name,
                            subCategoryId: s.id,
                            subCategoryName: s.name,
                            ...i,
                            variants: cleanedVariants,
                            action: existingItem?.action === "create" ? "create" : (String(i.id).startsWith('temp-') ? "create" : "update")
                        });
                    });
                });
            });
        },
        queuePriceUpdates: (state) => {
            state.menuData?.forEach(c => {
                c.sub_category?.forEach(s => {
                    s.items?.forEach(i => {
                        if (!i.id || String(i.id).startsWith('temp-')) return;
                        const existingItem = state.updated_menu.items.find(e => e.id === i.id);
                        const cleanedVariants = (i.variants || []).map(vg => ({
                            ...vg,
                            options: (vg.options || []).map(opt => {
                                const newOpt = { ...opt };
                                delete newOpt.is_veg;
                                return newOpt;
                            })
                        }));

                        const entry = {
                            id: i.id,
                            categoryId: c.id,
                            categoryName: c.name,
                            subCategoryId: s.id,
                            subCategoryName: s.name,
                            price: i.base_price || i.price,
                            base_price: i.base_price || i.price,
                            variants: cleanedVariants,
                            action: existingItem?.action === "create" ? "create" : "update",
                        };
                        upsertUpdatedMenuEntry(state.updated_menu.items, entry, i);
                        
                        if (!i.temp_id && (!existingItem || existingItem.action !== "create")) {
                            i.temp_id = `update-${i.id}`;
                        }
                    });
                });
            });
        },
        queueDescriptionUpdates: (state) => {
            state.menuData?.forEach(c => {
                c.sub_category?.forEach(s => {
                    s.items?.forEach(i => {
                        if (!i.id || String(i.id).startsWith('temp-')) return;
                        const existingItem = state.updated_menu.items.find(e => e.id === i.id);
                        const entry = {
                            id: i.id,
                            categoryId: c.id,
                            categoryName: c.name,
                            subCategoryId: s.id,
                            subCategoryName: s.name,
                            description: i.description || "",
                            action: existingItem?.action === "create" ? "create" : "update",
                        };
                        upsertUpdatedMenuEntry(state.updated_menu.items, entry, i);
                        
                        if (!i.temp_id && (!existingItem || existingItem.action !== "create")) {
                            i.temp_id = `update-${i.id}`;
                        }
                    });
                });
            });
        },

        bulkToggleAddon: (state, action) => {
            const { addonId, itemIds, isAttaching } = action.payload;
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    sub.items?.forEach(item => {
                        if (itemIds.includes(item.id)) {
                            if (!item.addons) item.addons = [];
                            if (isAttaching) {
                                if (!item.addons.includes(addonId)) {
                                    item.addons.push(addonId);
                                }
                            } else {
                                item.addons = item.addons.filter(id => id !== addonId);
                            }
                        }
                    });
                });
            });
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMenuByResId.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchMenuByResId.fulfilled, (state, action) => {
                state.loading = false;

                // Properly parse data whether it's wrapped in an object or just an array
                const payloadData = action.payload;
                const newMenuData = Array.isArray(payloadData)
                    ? payloadData
                    : (payloadData?.menu || payloadData?.data || []);

                state.menuData = newMenuData;
                state.updated_menu = createEmptyUpdatedMenu();
                state.imageUploadStatuses = {};
                state.ticketImageUpdates = {};
                state.addonsData = Array.isArray(payloadData?.addons) ? payloadData.addons : [];
                state.restaurantName = payloadData?.restaurantName || payloadData?.name || '';
                state.taskId = payloadData?.taskId || null;

                if (!state.activeResId && payloadData?.resId) {
                    state.activeResId = payloadData.resId;
                }

                // Default selection targets on layout initialize
                if (state.menuData.length > 0) {
                    // Only overwrite activeCategory if it's null or doesn't exist in new data
                    const categoryExists = state.activeCategory && state.menuData.find(c => c.id === state.activeCategory);
                    if (!categoryExists) {
                        state.activeCategory = state.menuData[0].id;
                        if (state.menuData[0].sub_category?.length > 0) {
                            state.activeSubCategory = state.menuData[0].sub_category[0].id;
                        } else {
                            state.activeSubCategory = null;
                        }
                    }
                } else {
                    state.activeCategory = null;
                    state.activeSubCategory = null;
                }
            })
            .addCase(fetchMenuByResId.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(saveMenuByResId.pending, (state) => {
                state.isSaving = true;
                state.error = null;
            })
            .addCase(saveMenuByResId.fulfilled, (state) => {
                state.isSaving = false;
                state.updated_menu = createEmptyUpdatedMenu();
            })
            .addCase(saveMenuByResId.rejected, (state, action) => {
                state.isSaving = false;
                state.error = action.payload;
            })
            .addCase(syncZomatoMenu.pending, (state) => {
                state.isSyncing = true;
                state.error = null;
            })
            .addCase(syncZomatoMenu.fulfilled, (state, action) => {
                state.isSyncing = false;
                state.imageUploadStatuses = {};
                state.ticketImageUpdates = {};
                state.updated_menu = createEmptyUpdatedMenu();

                const dbDoc = action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

                state.taskId = dbDoc?.taskId || null;
                state.menuData = Array.isArray(fetchedMenu) ? fetchedMenu : [];
                state.addonsData = Array.isArray(fetchedAddons) ? fetchedAddons : [];

                if (state.menuData.length > 0) {
                    const categoryExists = state.activeCategory && state.menuData.find(c => c.id === state.activeCategory);
                    if (!categoryExists) {
                        state.activeCategory = state.menuData[0].id;
                        if (state.menuData[0].sub_category?.length > 0) {
                            state.activeSubCategory = state.menuData[0].sub_category[0].id;
                        } else {
                            state.activeSubCategory = null;
                        }
                    }
                } else {
                    state.activeCategory = null;
                    state.activeSubCategory = null;
                }
            })
            .addCase(syncZomatoMenu.rejected, (state, action) => {
                state.isSyncing = false;
                state.error = action.payload;
            })
            .addCase(syncSwiggyMenu.pending, (state) => {
                state.isSyncing = true;
                state.error = null;
            })
            .addCase(syncSwiggyMenu.fulfilled, (state, action) => {
                state.isSyncing = false;
                state.imageUploadStatuses = {};
                state.ticketImageUpdates = {};
                state.updated_menu = createEmptyUpdatedMenu();

                const dbDoc = action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

                state.taskId = dbDoc?.taskId || null;
                state.menuData = Array.isArray(fetchedMenu) ? fetchedMenu : [];
                state.addonsData = Array.isArray(fetchedAddons) ? fetchedAddons : [];

                if (state.menuData.length > 0) {
                    const categoryExists = state.activeCategory && state.menuData.find(c => c.id === state.activeCategory);
                    if (!categoryExists) {
                        state.activeCategory = state.menuData[0].id;
                        if (state.menuData[0].sub_category?.length > 0) {
                            state.activeSubCategory = state.menuData[0].sub_category[0].id;
                        } else {
                            state.activeSubCategory = null;
                        }
                    }
                } else {
                    state.activeCategory = null;
                    state.activeSubCategory = null;
                }
            })
            .addCase(syncSwiggyMenu.rejected, (state, action) => {
                state.isSyncing = false;
                state.error = action.payload;
            })
            // Sync Petpooja Menu
            .addCase(syncPetpoojaMenu.pending, (state) => {
                state.isSyncing = true;
                state.error = null;
            })
            .addCase(syncPetpoojaMenu.fulfilled, (state, action) => {
                state.isSyncing = false;
                state.imageUploadStatuses = {};
                state.ticketImageUpdates = {};
                state.updated_menu = createEmptyUpdatedMenu();
                const dbDoc = action.payload?.data || action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

                if (dbDoc?.name) {
                    state.restaurantName = dbDoc.name;
                }
                state.menuData = Array.isArray(fetchedMenu) ? fetchedMenu : [];
                state.addonsData = Array.isArray(fetchedAddons) ? fetchedAddons : [];

                if (state.menuData.length > 0) {
                    const categoryExists = state.activeCategory && state.menuData.find(c => c.id === state.activeCategory);
                    if (!categoryExists) {
                        state.activeCategory = state.menuData[0].id;
                        if (state.menuData[0].sub_category?.length > 0) {
                            state.activeSubCategory = state.menuData[0].sub_category[0].id;
                        } else {
                            state.activeSubCategory = null;
                        }
                    }
                } else {
                    state.activeCategory = null;
                    state.activeSubCategory = null;
                }
            })
            .addCase(syncPetpoojaMenu.rejected, (state, action) => {
                state.isSyncing = false;
                state.error = action.payload;
            })
            // Sync Ownly Menu
            .addCase(syncOwnlyMenu.pending, (state) => {
                state.isSyncing = true;
                state.error = null;
            })
            .addCase(syncOwnlyMenu.fulfilled, (state, action) => {
                state.isSyncing = false;
                state.imageUploadStatuses = {};
                state.ticketImageUpdates = {};
                state.updated_menu = createEmptyUpdatedMenu();
                const dbDoc = action.payload?.data || action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

                if (dbDoc?.name) {
                    state.restaurantName = dbDoc.name;
                }
                state.menuData = Array.isArray(fetchedMenu) ? fetchedMenu : [];
                state.addonsData = Array.isArray(fetchedAddons) ? fetchedAddons : [];

                if (state.menuData.length > 0) {
                    const categoryExists = state.activeCategory && state.menuData.find(c => c.id === state.activeCategory);
                    if (!categoryExists) {
                        state.activeCategory = state.menuData[0].id;
                        if (state.menuData[0].sub_category?.length > 0) {
                            state.activeSubCategory = state.menuData[0].sub_category[0].id;
                        } else {
                            state.activeSubCategory = null;
                        }
                    }
                } else {
                    state.activeCategory = null;
                    state.activeSubCategory = null;
                }
            })
            .addCase(syncOwnlyMenu.rejected, (state, action) => {
                state.isSyncing = false;
                state.error = action.payload;
            });
    },
});

export const {
    setActiveResId,
    setActivePlatform,
    setActiveView,
    setActiveBulkMode,
    setActiveCategory,
    setActiveSubCategory,
    openImageSidebar,
    closeImageSidebar,
    clearMenuState,
    setImageUploadStatus,
    clearAllImageUploadStatuses,
    setGlobalSearchQuery,
    setTaskId,

    // Category actions
    addCategory,
    insertFullCategory,
    updateCategory,
    deleteCategory,
    addSubCategory,
    updateSubCategory,
    deleteSubCategory,
    addItem,
    updateItem,
    addImage,
    deleteItem,
    moveItem,
    moveSubCategory,
    mergeCategories,
    mergeSubCategories,
    bulkMergeCategories,
    bulkMergeSubCategories,
    bulkMergeCategoriesIntoNewName,
    bulkMergeSubCategoriesIntoNewName,
    bulkMoveItems,
    bulkMoveSubCategories,
    bulkMakeSubCategoriesAsCategories,

    // Addon actions
    addAddonGroup,
    updateAddonGroup,
    deleteAddonGroup,
    deleteAllAddons,
    addAddonOption,
    updateAddonOption,
    deleteAddonOption,
    toggleItemAddon,
    bulkToggleAddon,
    markMenuUpdatesDone,
    queueAll,
    queuePriceUpdates,
    queueDescriptionUpdates,
    setTicketImageUpdate,
    clearTicketImageUpdate,
    enqueueUploadJob,
    updateUploadJobStatus,
    clearUploadQueue
} = menuSlice.actions;

export default menuSlice.reducer;