"use client";

import { useState, useMemo } from "react";
import { useDispatch } from "react-redux";
import { bulkMoveItems, bulkMoveSubCategories, bulkMergeCategories, bulkMergeSubCategories, bulkMergeCategoriesIntoNewName, bulkMergeSubCategoriesIntoNewName, updateCategory, updateSubCategory, bulkMakeSubCategoriesAsCategories, addCategory, addSubCategory } from "@/store/slice/menuSlice";
import { FolderTree, ChevronRight, ChevronDown, CheckSquare, Square, CornerDownRight, Layers, Pencil, ArrowDownToLine, GitMerge, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import InlineInput from "@/components/ui/inline-input";
import { Input } from "@/components/ui/input";

export default function StructureEditor({ menuData }) {
    const dispatch = useDispatch();

    // Selections
    const [selectedItemIds, setSelectedItemIds] = useState(new Set());
    const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState(new Set());
    const [selectedCategoryIds, setSelectedCategoryIds] = useState(new Set());
    
    // Rename
    const [editingId, setEditingId] = useState(null);
    
    // Target
    const [targetSubCategoryId, setTargetSubCategoryId] = useState(null);
    const [targetCategoryId, setTargetCategoryId] = useState(null);
    const [newMergeName, setNewMergeName] = useState("");
    
    // Action Type (for Subcategories: 'MOVE' to category, or 'MERGE' to subcategory)
    const [subCatActionType, setSubCatActionType] = useState('MOVE');

    // Expand/Collapse state for the tree
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [expandedSubCategories, setExpandedSubCategories] = useState(new Set());

    // Filter out deleted items
    const activeCategories = useMemo(() => {
        if (!Array.isArray(menuData)) return [];
        return menuData;
    }, [menuData]);

    const toggleCategory = (id) => {
        const newSet = new Set(expandedCategories);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedCategories(newSet);
    };

    const toggleSubCategory = (id) => {
        const newSet = new Set(expandedSubCategories);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedSubCategories(newSet);
    };

    const handleItemToggle = (id) => {
        const newSet = new Set(selectedItemIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedItemIds(newSet);
    };

    const handleCategoryToggle = (id) => {
        const newSet = new Set(selectedCategoryIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedCategoryIds(newSet);
    };

    const handleSubCategoryToggle = (id) => {
        const newSet = new Set(selectedSubCategoryIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedSubCategoryIds(newSet);
    };

    const handleMoveOrMerge = () => {
        if (selectedItemIds.size > 0 && targetSubCategoryId) {
            dispatch(bulkMoveItems({
                itemIds: Array.from(selectedItemIds),
                targetSubCategoryId
            }));
            setSelectedItemIds(new Set());
        }

        if (selectedSubCategoryIds.size > 0) {
            if (subCatActionType === 'MOVE' && targetCategoryId) {
                dispatch(bulkMoveSubCategories({
                    subCategoryIds: Array.from(selectedSubCategoryIds),
                    targetCategoryId
                }));
            } else if (subCatActionType === 'MERGE' && newMergeName.trim()) {
                dispatch(bulkMergeSubCategoriesIntoNewName({
                    subCategoryIds: Array.from(selectedSubCategoryIds),
                    newName: newMergeName
                }));
                setNewMergeName("");
            } else if (subCatActionType === 'MAKE_CATEGORY') {
                dispatch(bulkMakeSubCategoriesAsCategories({
                    subCategoryIds: Array.from(selectedSubCategoryIds)
                }));
            }
            setSelectedSubCategoryIds(new Set());
        }

        if (selectedCategoryIds.size > 0 && newMergeName.trim()) {
            dispatch(bulkMergeCategoriesIntoNewName({
                categoryIds: Array.from(selectedCategoryIds),
                newName: newMergeName
            }));
            setNewMergeName("");
            setSelectedCategoryIds(new Set());
        }
    };

    const totalSelected = selectedItemIds.size + selectedSubCategoryIds.size + selectedCategoryIds.size;
    const canMove = (selectedItemIds.size > 0 && targetSubCategoryId) || 
                    (selectedSubCategoryIds.size > 0 && subCatActionType === 'MOVE' && targetCategoryId) ||
                    (selectedSubCategoryIds.size > 0 && subCatActionType === 'MERGE' && newMergeName.trim().length > 0 && selectedSubCategoryIds.size > 1) ||
                    (selectedSubCategoryIds.size > 0 && subCatActionType === 'MAKE_CATEGORY') ||
                    (selectedCategoryIds.size > 1 && newMergeName.trim().length > 0);

    return (
        <div className="flex h-full flex-col bg-white">
            <div className="p-6 border-b">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <FolderTree className="w-6 h-6 text-primary" />
                    Structure Organizer
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Select multiple items or subcategories on the left, choose a destination on the right, and instantly move them.
                </p>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT PANE: Source Selection */}
                <div className="flex-1 border-r flex flex-col bg-gray-50/50">
                    <div className="p-4 border-b bg-white font-semibold text-sm flex items-center justify-between">
                        <span>1. Select Sources</span>
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs px-2"
                                onClick={() => {
                                    dispatch(addCategory("New Category"));
                                }}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
                            </Button>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                {totalSelected} Selected
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {activeCategories.map(cat => {
                            const isCatExpanded = expandedCategories.has(cat.id);
                            const activeSubs = (cat.sub_category || []);
                            const isCatSelected = selectedCategoryIds.has(cat.id);

                            return (
                                <div key={cat.id} className="border rounded-lg bg-white shadow-sm overflow-hidden">
                                    <div className="flex items-center gap-2 p-3 hover:bg-gray-50 transition-colors">
                                        <button onClick={() => handleCategoryToggle(cat.id)} className="text-gray-400 hover:text-primary transition-colors">
                                            {isCatSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                        </button>
                                        <div 
                                            className="flex items-center gap-2 flex-1 cursor-pointer"
                                            onClick={() => toggleCategory(cat.id)}
                                        >
                                            {isCatExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                            <Layers className={`w-4 h-4 ${isCatSelected ? 'text-primary' : 'text-gray-600'}`} />
                                            
                                            {editingId === cat.id ? (
                                            <div onClick={e => e.stopPropagation()} className="flex-1">
                                                <InlineInput
                                                    initialValue={cat.name}
                                                    onSubmit={(val) => {
                                                        const trimmed = val.trim();
                                                        if (trimmed) dispatch(updateCategory({ categoryId: cat.id, data: { name: trimmed } }));
                                                        setEditingId(null);
                                                    }}
                                                    onCancel={() => setEditingId(null)}
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex flex-1 items-center justify-between group">
                                                <span className="font-semibold text-gray-800">{cat.name}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            if (!expandedCategories.has(cat.id)) toggleCategory(cat.id);
                                                            dispatch(addSubCategory({ categoryId: cat.id, name: "New Subcategory" }));
                                                        }}
                                                        className="p-1 text-gray-400 hover:text-primary transition-colors"
                                                        title="Add Subcategory"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setEditingId(cat.id); }}
                                                        className="p-1 text-gray-400 hover:text-primary transition-colors"
                                                        title="Rename Category"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                    </div>

                                    {isCatExpanded && (
                                        <div className="border-t">
                                            {activeSubs.map(sub => {
                                                const isSubExpanded = expandedSubCategories.has(sub.id);
                                                const activeItems = (sub.items || []);
                                                const isSubSelected = selectedSubCategoryIds.has(sub.id);

                                                return (
                                                    <div key={sub.id} className="border-b last:border-0 border-gray-100 bg-gray-50/30">
                                                        <div className="flex items-center gap-3 py-2 px-6 hover:bg-gray-100 transition-colors">
                                                            <button onClick={() => handleSubCategoryToggle(sub.id)} className="text-gray-400 hover:text-primary transition-colors">
                                                                {isSubSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                                            </button>
                                                            <div 
                                                                className="flex items-center gap-2 flex-1 cursor-pointer"
                                                                onClick={() => toggleSubCategory(sub.id)}
                                                            >
                                                                {isSubExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                                
                                                                {editingId === sub.id ? (
                                                                    <div onClick={e => e.stopPropagation()} className="flex-1">
                                                                        <InlineInput
                                                                            initialValue={sub.name}
                                                                            onSubmit={(val) => {
                                                                                const trimmed = val.trim();
                                                                                if (trimmed) dispatch(updateSubCategory({ subCategoryId: sub.id, data: { name: trimmed } }));
                                                                                setEditingId(null);
                                                                            }}
                                                                            onCancel={() => setEditingId(null)}
                                                                            autoFocus
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-1 items-center justify-between group/sub">
                                                                        <span className={`text-sm font-medium ${isSubSelected ? 'text-primary' : 'text-gray-700'}`}>
                                                                            {sub.name}
                                                                        </span>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setEditingId(sub.id); }}
                                                                            className="opacity-0 group-hover/sub:opacity-100 p-1 text-gray-400 hover:text-primary transition-opacity"
                                                                        >
                                                                            <Pencil className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {isSubExpanded && (
                                                            <div className="pl-14 pr-4 py-2 space-y-1 bg-white border-y border-gray-100">
                                                                {activeItems.map(item => {
                                                                    const isSelected = selectedItemIds.has(item.id);
                                                                    return (
                                                                        <div 
                                                                            key={item.id}
                                                                            onClick={() => handleItemToggle(item.id)}
                                                                            className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                                                                isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'
                                                                            }`}
                                                                        >
                                                                            <button className="text-gray-400">
                                                                                {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                                                            </button>
                                                                            <span className={`text-sm ${isSelected ? 'text-primary font-medium' : 'text-gray-600'}`}>
                                                                                {item.name}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {activeItems.length === 0 && (
                                                                    <div className="text-xs text-gray-400 py-1 italic">No items</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {activeSubs.length === 0 && (
                                                <div className="text-xs text-gray-400 p-3 italic pl-10">No subcategories</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT PANE: Target Selection */}
                <div className="flex-1 flex flex-col bg-white">
                    <div className="p-4 border-b bg-white font-semibold text-sm">
                        2. Select Destination
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        
                        {/* Target for ITEMS */}
                        {selectedItemIds.size > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Move {selectedItemIds.size} Items To Subcategory:</h3>
                                <div className="space-y-2">
                                    {activeCategories.map(cat => (
                                        <div key={cat.id} className="space-y-1">
                                            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                                <Layers className="w-3.5 h-3.5 text-gray-400" />
                                                {cat.name}
                                            </div>
                                            <div className="pl-5 space-y-1">
                                                {(cat.sub_category || [])
                                                    .map(sub => (
                                                    <div 
                                                        key={sub.id}
                                                        onClick={() => setTargetSubCategoryId(sub.id)}
                                                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border transition-colors ${
                                                            targetSubCategoryId === sub.id 
                                                            ? 'border-primary bg-primary/5 shadow-sm' 
                                                            : 'border-transparent hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <CornerDownRight className="w-3.5 h-3.5 text-gray-400" />
                                                        <span className={`text-sm ${targetSubCategoryId === sub.id ? 'text-primary font-medium' : 'text-gray-600'}`}>
                                                            {sub.name}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Target for SUBCATEGORIES */}
                        {selectedSubCategoryIds.size > 0 && (
                            <div className="space-y-3 mt-6">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button 
                                        onClick={() => { setSubCatActionType('MOVE'); setTargetSubCategoryId(null); }}
                                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${subCatActionType === 'MOVE' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                    >
                                        <ArrowDownToLine className="w-3.5 h-3.5 inline mr-1" /> Move To Category
                                    </button>
                                    <button 
                                        onClick={() => { setSubCatActionType('MERGE'); setTargetCategoryId(null); }}
                                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${subCatActionType === 'MERGE' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                    >
                                        <GitMerge className="w-3.5 h-3.5 inline mr-1" /> Merge Into Subcategory
                                    </button>
                                    <button 
                                        onClick={() => { setSubCatActionType('MAKE_CATEGORY'); setTargetCategoryId(null); setTargetSubCategoryId(null); }}
                                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${subCatActionType === 'MAKE_CATEGORY' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                    >
                                        <FolderTree className="w-3.5 h-3.5 inline mr-1" /> Make as Category
                                    </button>
                                </div>
                                
                                {subCatActionType === 'MOVE' && (
                                    <div className="space-y-2 mt-3">
                                        {activeCategories.map(cat => (
                                            <div 
                                                key={cat.id}
                                                onClick={() => setTargetCategoryId(cat.id)}
                                                className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border transition-colors ${
                                                    targetCategoryId === cat.id 
                                                    ? 'border-primary bg-primary/5 shadow-sm' 
                                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                            >
                                                <Layers className={`w-4 h-4 ${targetCategoryId === cat.id ? 'text-primary' : 'text-gray-500'}`} />
                                                <span className={`text-sm ${targetCategoryId === cat.id ? 'text-primary font-medium' : 'text-gray-700'}`}>
                                                    {cat.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {subCatActionType === 'MERGE' && (
                                    <div className="space-y-4 mt-4 p-4 border rounded-lg bg-amber-50/50 border-amber-100">
                                        {selectedSubCategoryIds.size < 2 ? (
                                            <p className="text-sm text-amber-600">Please select at least 2 subcategories to merge.</p>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 block">
                                                        New Merged Subcategory Name
                                                    </label>
                                                    <Input 
                                                        value={newMergeName}
                                                        onChange={(e) => setNewMergeName(e.target.value)}
                                                        placeholder="e.g. All Beverages"
                                                        className="border-amber-200 focus-visible:ring-amber-500"
                                                        autoFocus
                                                    />
                                                </div>
                                                <p className="text-xs text-amber-600">
                                                    All items from the {selectedSubCategoryIds.size} selected subcategories will be combined into this new subcategory. The old ones will be removed.
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}

                                {subCatActionType === 'MAKE_CATEGORY' && (
                                    <div className="space-y-4 mt-4 p-4 border rounded-lg bg-purple-50/50 border-purple-100">
                                        <h3 className="text-sm font-semibold text-purple-800">Convert {selectedSubCategoryIds.size} Subcategor{selectedSubCategoryIds.size > 1 ? 'ies' : 'y'} to Categor{selectedSubCategoryIds.size > 1 ? 'ies' : 'y'}</h3>
                                        <p className="text-xs text-purple-700">
                                            The selected subcategories will be extracted from their current categories. For each one, a new Category will be created with the exact same name, containing a single Subcategory (also with the same name) holding all its items.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Target for CATEGORIES */}
                        {selectedCategoryIds.size > 0 && (
                            <div className="space-y-4 mt-6 p-4 border rounded-lg bg-amber-50/50 border-amber-100">
                                {selectedCategoryIds.size < 2 ? (
                                    <p className="text-sm text-amber-600">Please select at least 2 categories to merge.</p>
                                ) : (
                                    <>
                                        <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1 mb-2">
                                            <GitMerge className="w-3.5 h-3.5" /> Merge {selectedCategoryIds.size} Categories Into:
                                        </h3>
                                        <div>
                                            <label className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 block">
                                                New Merged Category Name
                                            </label>
                                            <Input 
                                                value={newMergeName}
                                                onChange={(e) => setNewMergeName(e.target.value)}
                                                placeholder="e.g. All Drinks"
                                                className="border-amber-200 focus-visible:ring-amber-500"
                                                autoFocus
                                            />
                                        </div>
                                        <p className="text-xs text-amber-600">
                                            All subcategories and items from the selected categories will be combined into this new category. The old categories will be removed.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        {totalSelected === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-3">
                                <FolderTree className="w-10 h-10 opacity-20" />
                                <p className="text-sm">Select items or subcategories on the left first.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ACTION BAR */}
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
                <div className="text-sm text-gray-600">
                    {totalSelected === 0 ? (
                        <span>Ready to organize.</span>
                    ) : (
                        <span>
                            Ready to move <strong className="text-gray-900">{selectedItemIds.size} items</strong> and <strong className="text-gray-900">{selectedSubCategoryIds.size} subcategories</strong>.
                        </span>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button 
                        variant="outline" 
                        onClick={() => {
                            setSelectedItemIds(new Set());
                            setSelectedSubCategoryIds(new Set());
                            setSelectedCategoryIds(new Set());
                            setTargetSubCategoryId(null);
                            setTargetCategoryId(null);
                            setNewMergeName("");
                        }}
                        disabled={totalSelected === 0}
                    >
                        Clear Selection
                    </Button>
                    <Button 
                        onClick={handleMoveOrMerge}
                        disabled={!canMove}
                        className={`${(subCatActionType === 'MERGE' || selectedCategoryIds.size > 0) ? 'bg-amber-500 hover:bg-amber-600' : (subCatActionType === 'MAKE_CATEGORY' ? 'bg-purple-500 hover:bg-purple-600' : 'bg-primary hover:bg-primary/90')} text-white shadow-md`}
                    >
                        {selectedCategoryIds.size > 0 || subCatActionType === 'MERGE' ? 'Confirm Merge' : (subCatActionType === 'MAKE_CATEGORY' ? 'Confirm Conversion' : 'Confirm Move')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
