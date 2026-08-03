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
    error: null,
    globalSearchQuery: "",
};

const menuSlice = createSlice({
    name: 'menu',
    initialState,
    reducers: {
        setActiveResId: (state, action) => {
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
        setImageUploadStatus: (state, action) => {
            const { itemId, status } = action.payload;
            if (!itemId) return;
            if (status === null) {
                delete state.imageUploadStatuses[itemId];
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

        clearMenuState: () => initialState,

        // --- Category CRUD Reducers ---
        addCategory: (state, action) => {
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
            if (!Array.isArray(state.menuData)) state.menuData = [];

            // The payload is the fully formed category object with new temp- IDs generated
            // We just need to append it.
            state.menuData.push(action.payload);
        },
        updateCategory: (state, action) => {
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
            const categoryId = action.payload;
            if (String(categoryId).startsWith('temp-')) {
                state.menuData = state.menuData?.filter(cat => cat.id !== categoryId) || [];
                state.updated_menu.categories = state.updated_menu.categories.filter(entry => entry.id !== categoryId);
            } else {
                upsertUpdatedMenuEntry(state.updated_menu.categories, { id: categoryId, action: "delete" });
                const category = state.menuData?.find(cat => cat.id === categoryId);
                if (category) {
                    category.status = 'delete';
                    category.temp_id = `delete-${categoryId}`;
                    category.sub_category?.forEach(sub => {
                        sub.status = 'delete';
                        sub.items?.forEach(item => {
                            item.status = 'delete';
                            item.variants?.forEach(variant => variant.status = 'delete');
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
            const subCategoryId = action.payload;
            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    if (String(subCategoryId).startsWith('temp-')) {
                        cat.sub_category = cat.sub_category.filter(s => s.id !== subCategoryId);
                        state.updated_menu.sub_categories = state.updated_menu.sub_categories.filter(entry => entry.id !== subCategoryId);
                    } else {
                        upsertUpdatedMenuEntry(state.updated_menu.sub_categories, { id: subCategoryId, categoryId: cat.id, action: "delete" });
                        const sub = cat.sub_category.find(s => s.id === subCategoryId);
                        if (sub) {
                            sub.status = 'delete';
                            sub.temp_id = `delete-${subCategoryId}`;
                            sub.items?.forEach(item => {
                                item.status = 'delete';
                                item.variants?.forEach(variant => variant.status = 'delete');
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
            const { subCategoryId, item } = action.payload;
            state.menuData?.forEach(cat => {
                const sub = cat.sub_category?.find(s => s.id === subCategoryId);
                if (sub) {
                    if (!sub.items) sub.items = [];
                    const newItemId = item.id || ('temp-' + crypto.randomUUID());
                    const newItem = { ...item, id: newItemId };
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
            state.menuData?.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    const itemIndex = sub.items?.findIndex(i => i.id === itemId);
                    if (itemIndex !== undefined && itemIndex !== -1) {
                        const updateTag = String(itemId).startsWith('temp-') ? sub.items[itemIndex].temp_id : `update-${itemId}`;
                        sub.items[itemIndex] = { ...sub.items[itemIndex], ...updates, temp_id: updateTag };
                        const existingEntry = state.updated_menu.items.find(entry => entry.id === itemId);
                        upsertUpdatedMenuEntry(state.updated_menu.items, { ...updates, id: itemId, categoryId: cat.id, categoryName: cat.name, subCategoryId: sub.id, subCategoryName: sub.name, action: existingEntry?.action || (String(itemId).startsWith('temp-') ? "create" : "update") }, sub.items[itemIndex]);
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
                        targetCat.sub_category.push(...cat.sub_category);
                    }
                    if (String(cat.id).startsWith('temp-')) {
                        state.menuData = state.menuData.filter(c => c.id !== cat.id);
                    } else {
                        cat.status = 'delete';
                    }
                }
            });
        },
        bulkMergeSubCategories: (state, action) => {
            const { subCategoryIds, targetSubCategoryId } = action.payload;
            if (!subCategoryIds?.length || !targetSubCategoryId) return;

            let targetSub = null;
            state.menuData?.forEach(cat => {
                const found = cat.sub_category?.find(s => s.id === targetSubCategoryId);
                if (found) targetSub = found;
            });
            if (!targetSub) return;

            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        const sub = cat.sub_category[i];
                        if (subCategoryIds.includes(sub.id) && sub.id !== targetSubCategoryId) {
                            if (sub.items && sub.items.length > 0) {
                                if (!targetSub.items) targetSub.items = [];
                                targetSub.items.push(...sub.items);
                            }
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
        bulkMergeCategoriesIntoNewName: (state, action) => {
            const { categoryIds, newName } = action.payload;
            if (!categoryIds?.length || categoryIds.length < 2 || !newName?.trim()) return;

            // Pick the first one as the target
            const targetId = categoryIds[0];
            const targetCat = state.menuData?.find(c => c.id === targetId);
            if (!targetCat) return;

            // Rename target
            targetCat.name = newName.trim();

            // Merge the rest into target
            state.menuData?.forEach(cat => {
                if (categoryIds.includes(cat.id) && cat.id !== targetId) {
                    if (cat.sub_category && cat.sub_category.length > 0) {
                        if (!targetCat.sub_category) targetCat.sub_category = [];

                        cat.sub_category.forEach(sub => {
                            const existingSub = targetCat.sub_category.find(s =>
                                s.name?.toLowerCase().trim() === sub.name?.toLowerCase().trim() &&
                                s.status !== 'delete' && s.status !== 'deleted'
                            );

                            if (existingSub) {
                                // Subcategory with same name already exists in target category.
                                // Merge items into the existing subcategory to prevent duplicate subcategories.
                                if (sub.items && sub.items.length > 0) {
                                    if (!existingSub.items) existingSub.items = [];
                                    sub.items.forEach(item => {
                                        const existingItem = existingSub.items.find(i =>
                                            i.name?.toLowerCase().trim() === item.name?.toLowerCase().trim() &&
                                            i.status !== 'delete' && i.status !== 'deleted'
                                        );
                                        if (!existingItem) {
                                            existingSub.items.push(item);
                                        }
                                    });
                                }
                            } else {
                                targetCat.sub_category.push(sub);
                            }
                        });
                    }
                    if (String(cat.id).startsWith('temp-')) {
                        state.menuData = state.menuData.filter(c => c.id !== cat.id);
                    } else {
                        cat.status = 'delete';
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
            state.menuData?.forEach(cat => {
                const found = cat.sub_category?.find(s => s.id === targetId);
                if (found) targetSub = found;
            });
            if (!targetSub) return;

            // Rename target
            targetSub.name = newName.trim();

            // Merge the rest into target
            state.menuData?.forEach(cat => {
                if (cat.sub_category) {
                    for (let i = cat.sub_category.length - 1; i >= 0; i--) {
                        const sub = cat.sub_category[i];
                        if (subCategoryIds.includes(sub.id) && sub.id !== targetId) {
                            if (sub.items && sub.items.length > 0) {
                                if (!targetSub.items) targetSub.items = [];

                                sub.items.forEach(item => {
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
                            }
                        }
                    }
                }
            });
        },
        bulkMoveItems: (state, action) => {
            const { itemIds, targetSubCategoryId } = action.payload;
            if (!itemIds?.length || !targetSubCategoryId) return;

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

            // 2. Add to target
            if (itemsToMove.length > 0) {
                state.menuData?.forEach(cat => {
                    cat.sub_category?.forEach(sub => {
                        if (sub.id === targetSubCategoryId) {
                            if (!sub.items) sub.items = [];
                            sub.items.push(...itemsToMove);
                        }
                    });
                });
            }
        },
        bulkMoveSubCategories: (state, action) => {
            const { subCategoryIds, targetCategoryId } = action.payload;
            if (!subCategoryIds?.length || !targetCategoryId) return;

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

            // 2. Add to target
            if (subsToMove.length > 0) {
                const targetCat = state.menuData?.find(c => c.id === targetCategoryId);
                if (targetCat) {
                    if (!targetCat.sub_category) targetCat.sub_category = [];
                    targetCat.sub_category.push(...subsToMove);
                }
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
                state.addonsData = Array.isArray(payloadData?.addons) ? payloadData.addons : [];
                state.restaurantName = payloadData?.restaurantName || payloadData?.name || '';

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

                const dbDoc = action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

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

                const dbDoc = action.payload;
                const fetchedMenu = dbDoc?.menu || [];
                const fetchedAddons = dbDoc?.addons || [];

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
    setGlobalSearchQuery,

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
    clearTicketImageUpdate
} = menuSlice.actions;

export default menuSlice.reducer;