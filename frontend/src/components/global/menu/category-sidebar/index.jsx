"use client";
import CategoryCard from "./category-card";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/store/hooks/useMenu";
import { useMemo, useState, useEffect } from "react";
import InlineInput from "@/components/ui/inline-input";
import { Plus, Layers, Settings2, DollarSign, AlignLeft, Image as ImageIcon, ChevronLeft, ChevronRight, FileUp, Share, Cloud, PlusCircle, AlertTriangle, ClipboardPaste, Ticket } from "lucide-react";

export default function CategorySidebar() {
    const {
        menuData,
        activeView,
        setActiveView,
        activeBulkMode,
        setActiveBulkMode,
        activeCategory,
        setActiveCategory,
        activeSubCategory,
        setActiveSubCategory,
        addCategory,
        updateCategory,
        deleteCategory,
        addSubCategory,
        updateSubCategory,
        deleteSubCategory,
        copyCategoryToClipboard,
        pasteCategoryFromClipboard,
        hasCopiedCategory,
    } = useMenu();

    const [addingCategory, setAddingCategory] = useState(false);
    const [expandedCategoryId, setExpandedCategoryId] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const categories = useMemo(() => {
        if (!Array.isArray(menuData)) return [];
        return menuData
            .map((cat) => ({
                id: cat.id,
                name: cat.name,
                temp_id: cat.temp_id,
                status: cat.status,
                raw: cat,
                subcategories: (cat.sub_category || [])
                    .map((sub) => ({
                        id: sub.id,
                        name: sub.name,
                        temp_id: sub.temp_id,
                        status: sub.status,
                        raw: sub,
                    }))
            }))
    }, [menuData]);

    useEffect(() => {
        if (categories.length > 0 && !expandedCategoryId && !activeCategory) {
            setExpandedCategoryId(categories[0].id);
        }
    }, [categories, expandedCategoryId, activeCategory]);

    return (
        <div className={`relative flex h-full transition-all duration-300 ${isCollapsed ? 'w-0' : 'w-[300px]'} shrink-0 z-20`}>
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 z-100 flex h-6 w-6 items-center justify-center rounded-full border bg-white shadow-md hover:bg-gray-50 text-gray-500 transition-colors"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            <aside className={`flex h-full w-[300px] flex-col border-r bg-white/60 backdrop-blur-xl shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] overflow-hidden transition-transform duration-300 ${isCollapsed ? '-translate-x-full' : 'translate-x-0'}`}>
                {setActiveView && (
                    <div className="px-5 py-3 border-b border-border/50 bg-slate-50/30 shrink-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg flex-1">
                                <button
                                    onClick={() => setActiveView("MENU")}
                                    className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${activeView === "MENU"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-950"
                                        }`}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    Menu
                                </button>
                                <button
                                    onClick={() => setActiveView("BULK")}
                                    className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${activeView === "BULK"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-950"
                                        }`}
                                >
                                    <Settings2 className="w-3.5 h-3.5" />
                                    Bulk Edit
                                </button>
                            </div>
                            {!addingCategory && activeView === "MENU" && (
                                <div className="flex items-center gap-1 shrink-0">
                                    {hasCopiedCategory && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                            onClick={pasteCategoryFromClipboard}
                                            title="Paste Category"
                                        >
                                            <ClipboardPaste className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                        onClick={() => setAddingCategory(true)}
                                        title="Add Category"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                        {addingCategory && (
                            <div className="mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                <InlineInput
                                    placeholder="Category name"
                                    onSubmit={(name) => {
                                        const trimmed = name.trim();
                                        if (trimmed && addCategory) addCategory(trimmed);
                                        setAddingCategory(false);
                                    }}
                                    onCancel={() => setAddingCategory(false)}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto w-full">
                    {activeView === "MENU" ? (
                        <div className="space-y-2 p-3 pb-8">
                            {categories.map((category, index) => (
                                <CategoryCard
                                    key={category.id || index}
                                    category={category}
                                    index={index}
                                    isExpanded={expandedCategoryId === category.id}
                                    onToggleExpand={() =>
                                        setExpandedCategoryId(expandedCategoryId === category.id ? null : category.id)
                                    }
                                    activeCategory={activeCategory}
                                    setActiveCategory={setActiveCategory}
                                    activeSubCategory={activeSubCategory}
                                    setActiveSubCategory={setActiveSubCategory}
                                    updateCategory={updateCategory}
                                    deleteCategory={deleteCategory}
                                    addSubCategory={addSubCategory}
                                    updateSubCategory={updateSubCategory}
                                    deleteSubCategory={deleteSubCategory}
                                    copyCategoryToClipboard={copyCategoryToClipboard}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1 p-3 pb-8">
                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">Edit Modes</div>

                            <button
                                onClick={() => setActiveBulkMode("PRICE")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "PRICE" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <DollarSign className="w-4 h-4" /> Price Editor
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("STRUCTURE")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "STRUCTURE" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <Layers className="w-4 h-4" /> Structure Organizer
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("ADDONS")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "ADDONS" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <PlusCircle className="w-4 h-4" /> Addons Builder
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("HOLD_ITEMS")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "HOLD_ITEMS" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <AlertTriangle className="w-4 h-4 text-amber-500" /> Hold Items
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("DESCRIPTION")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "DESCRIPTION" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <AlignLeft className="w-4 h-4" /> Description Editor
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("IMAGE")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "IMAGE" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <ImageIcon className="w-4 h-4" /> Image Editor
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("UPLOAD")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "UPLOAD" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <FileUp className="w-4 h-4" /> Upload Menu
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("TRANSFER")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "TRANSFER" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <Share className="w-4 h-4" /> Transfer Menu
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("EXPORT_IMAGES")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "EXPORT_IMAGES" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <Cloud className="w-4 h-4" /> Export Images
                            </button>
                            <button
                                onClick={() => setActiveBulkMode("TICKETS")}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeBulkMode === "TICKETS" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                <Ticket className="w-4 h-4" /> Swiggy Tickets
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}