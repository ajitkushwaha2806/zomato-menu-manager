"use client";

import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import {
  Layers,
  Settings2,
  DollarSign,
  AlignLeft,
  Image as ImageIcon,
  FileUp,
  Share,
  Cloud,
  PlusCircle,
  Plus,
  AlertTriangle,
  ClipboardPaste,
  Ticket,
} from "lucide-react";

import { useMenu } from "@/store/hooks/useMenu";
import InlineInput from "@/components/ui/inline-input";
import CategoryCard from "@/components/global/menu/category-sidebar/category-card";
import { Button } from "@/components/ui/button";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./project-switcher";
import { NavUser } from "@/components/nav-user";

export function AppSidebar({ ...props }) {
  const {
    menuData,
    activePlatform,
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

  const categories = useMemo(() => {
    if (!Array.isArray(menuData)) return [];
    return menuData
      .filter((cat) => cat.status !== "delete" && cat.status !== "deleted")
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        temp_id: cat.temp_id,
        raw: cat,
        subcategories: (cat.sub_category || [])
          .filter((sub) => sub.status !== "delete" && sub.status !== "deleted")
          .map((sub) => ({
            id: sub.id,
            name: sub.name,
            temp_id: sub.temp_id,
            raw: sub,
          })),
      }));
  }, [menuData]);

  useEffect(() => {
    if (categories.length > 0 && !expandedCategoryId && !activeCategory) {
      setExpandedCategoryId(categories[0].id);
    }
  }, [categories, expandedCategoryId, activeCategory]);

  return (
    <Sidebar collapsible="icon" className="bg-white" {...props}>
      <SidebarHeader>
        <ProjectSwitcher />
        {setActiveView && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col gap-1 p-1 bg-slate-100/80 rounded-[10px] flex-1 border border-border/50 shadow-inner">
                <button
                  onClick={() => setActiveView("MENU")}
                  className={`flex items-center justify-center gap-2 py-1.5 text-[13px] font-semibold rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${
                    activeView === "MENU"
                      ? "bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-slate-200/50"
                  }`}
                  title="Menu"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Menu</span>
                </button>
                <button
                  onClick={() => setActiveView("BULK")}
                  className={`flex items-center justify-center gap-2 py-1.5 text-[13px] font-semibold rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${
                    activeView === "BULK"
                      ? "bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-slate-200/50"
                  }`}
                  title="Bulk Edit"
                >
                  <Settings2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Bulk Edit</span>
                </button>
              </div>
              
              {!addingCategory && activeView === "MENU" && (
                <div className="flex items-center gap-1 shrink-0 group-data-[collapsible=icon]:hidden">
                  {hasCopiedCategory && (
                    <button
                      onClick={pasteCategoryFromClipboard}
                      className="p-2 rounded-[10px] bg-slate-100/80 hover:bg-slate-200 text-muted-foreground hover:text-foreground border border-border/50 transition-colors shadow-inner"
                      title="Paste Category"
                    >
                      <ClipboardPaste className="w-4 h-4 shrink-0" />
                    </button>
                  )}
                  <button
                    onClick={() => setAddingCategory(true)}
                    className="p-2 rounded-[10px] bg-slate-100/80 hover:bg-slate-200 text-muted-foreground hover:text-foreground border border-border/50 transition-colors shadow-inner"
                    title="Add Category"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              )}
            </div>

            {addingCategory && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-200">
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
      </SidebarHeader>

      <SidebarContent>
        {activeView === "MENU" ? (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="flex flex-col gap-2">
              {categories.map((category, index) => (
                <CategoryCard
                  key={category.id || index}
                  category={category}
                  index={index}
                  isExpanded={expandedCategoryId === category.id}
                  onToggleExpand={() =>
                    setExpandedCategoryId(
                      expandedCategoryId === category.id ? null : category.id
                    )
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
          </SidebarGroup>
        ) : (
          <div className="space-y-1.5 p-3 pb-8 group-data-[collapsible=icon]:p-2">
            <div className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest px-3 mb-3 group-data-[collapsible=icon]:hidden">Edit Modes</div>
            
            <button
                onClick={() => setActiveBulkMode("PRICE")}
                title="Price Editor"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "PRICE" ? "bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/20 scale-[1.01]" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground hover:scale-[1.01]"
                    }`}
            >
                <DollarSign className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "PRICE" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Price Editor</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("STRUCTURE")}
                title="Structure Organizer"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "STRUCTURE" ? "bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/20 scale-[1.01]" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground hover:scale-[1.01]"
                    }`}
            >
                <Layers className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "STRUCTURE" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Structure Organizer</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("ADDONS")}
                title="Addons Builder"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "ADDONS" ? "bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/20 scale-[1.01]" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground hover:scale-[1.01]"
                    }`}
            >
                <PlusCircle className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "ADDONS" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Addons Builder</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("HOLD_ITEMS")}
                title="Hold Items"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "HOLD_ITEMS" ? "bg-amber-500/10 text-amber-700 font-bold shadow-sm ring-1 ring-amber-500/20 scale-[1.01]" : "text-muted-foreground hover:bg-amber-50/50 hover:text-amber-700 hover:scale-[1.01]"
                    }`}
            >
                <AlertTriangle className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "HOLD_ITEMS" ? "scale-110 text-amber-600" : "text-amber-500/70"}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Hold Items</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("DESCRIPTION")}
                title="Description Editor"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "DESCRIPTION" ? "bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/20 scale-[1.01]" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground hover:scale-[1.01]"
                    }`}
            >
                <AlignLeft className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "DESCRIPTION" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Description Editor</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("IMAGE")}
                title="Image Editor"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "IMAGE" ? "bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary/20 scale-[1.01]" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground hover:scale-[1.01]"
                    }`}
            >
                <ImageIcon className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "IMAGE" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Image Editor</span>
            </button>
            <div className="h-px bg-border/50 my-2 group-data-[collapsible=icon]:hidden"></div>
            <button
                onClick={() => setActiveBulkMode("UPLOAD")}
                title="Upload Menu"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "UPLOAD" ? "bg-slate-800 text-white font-bold shadow-md scale-[1.01]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.01]"
                    }`}
            >
                <FileUp className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "UPLOAD" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Upload Menu</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("TRANSFER")}
                title="Transfer Menu"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "TRANSFER" ? "bg-slate-800 text-white font-bold shadow-md scale-[1.01]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.01]"
                    }`}
            >
                <Share className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "TRANSFER" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Transfer Menu</span>
            </button>
            <button
                onClick={() => setActiveBulkMode("EXPORT_IMAGES")}
                title="Export Images"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "EXPORT_IMAGES" ? "bg-slate-800 text-white font-bold shadow-md scale-[1.01]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.01]"
                    }`}
            >
                <Cloud className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "EXPORT_IMAGES" ? "scale-110" : ""}`} /> 
                <span className="group-data-[collapsible=icon]:hidden">Export Images</span>
            </button>
            {activePlatform === "swiggy" && (
                <button
                    onClick={() => setActiveBulkMode("TICKETS")}
                    title="Swiggy Tickets"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${activeBulkMode === "TICKETS" ? "bg-slate-800 text-white font-bold shadow-md scale-[1.01]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.01]"
                        }`}
                >
                    <Ticket className={`w-4 h-4 shrink-0 transition-transform ${activeBulkMode === "TICKETS" ? "scale-110" : ""}`} /> 
                    <span className="group-data-[collapsible=icon]:hidden">Swiggy Tickets</span>
                </button>
            )}
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
