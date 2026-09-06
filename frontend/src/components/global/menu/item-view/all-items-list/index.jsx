"use client";
import MenuItemRow from "../menu-item-card";
import { useMenu } from "@/store/hooks/useMenu";

export default function AllItemsList({ menuData, updateItem, deleteItem, moveItem }) {
    const { addItem } = useMenu();
    const allItems = [];
    if (Array.isArray(menuData)) {
        menuData.forEach((cat) => {
            if (cat.sub_category) {
                cat.sub_category.forEach((sub) => {
                    if (sub.items) {
                        sub.items.forEach((item) => {
                            allItems.push({
                                ...item,
                                _parentCategoryId: cat.id,
                                _parentSubCategoryId: sub.id,
                            });
                        });
                    }
                });
            }
        });
    }

    const handleConvertVariantsToItems = (itemToConvert, groupIndex) => {
        if (!itemToConvert._parentSubCategoryId) return;
        
        const group = itemToConvert.variants[groupIndex];
        if (!group || !group.options || group.options.length === 0) return;

        group.options.forEach(option => {
            if (!option.option_name) return;
            addItem({
                subCategoryId: itemToConvert._parentSubCategoryId,
                item: {
                    ...itemToConvert,
                    id: `temp-${crypto.randomUUID()}`,
                    name: `${option.option_name} ${itemToConvert.name || ''}`.trim(),
                    base_price: option.price || 0,
                    variants: [],
                }
            });
        });

        // Delete original item
        deleteItem(itemToConvert.id);
    };

    return (
        <div className="flex h-full flex-1 flex-col border-x bg-background/50 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b bg-background px-6 py-4">
                <div>
                    <h2 className="text-xl font-semibold">All Items</h2>
                    <p className="text-sm text-muted-foreground">
                        {allItems.length} total items
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {allItems.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        No items found across any categories.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {allItems
                            .map((item) => (
                                    <MenuItemRow
                                        key={item.id}
                                        item={item}
                                        categories={menuData}
                                        isAllItemsView={true}
                                        onChange={(updatedItem) => {
                                            if (updatedItem._parentSubCategoryId && updatedItem._parentSubCategoryId !== item._parentSubCategoryId) {
                                                moveItem(item.id, updatedItem._parentSubCategoryId);
                                            } else {
                                                updateItem(item.id, updatedItem);
                                            }
                                        }}
                                        onDelete={() => deleteItem(item.id)}
                                        onConvertVariantsToItems={handleConvertVariantsToItems}
                                    />
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}
