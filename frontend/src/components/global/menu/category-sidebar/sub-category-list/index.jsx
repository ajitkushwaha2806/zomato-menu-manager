"use client";

import { useState } from "react";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import InlineInput from "@/components/ui/inline-input";
import ActionMenu from "../action-menu";

export default function SubCategoryList({
    categoryId,
    subcategories = [],
    activeSubCategory,
    setActiveSubCategory,
    setActiveCategory,
    updateSubCategory,
    deleteSubCategory,
}) {
    const [editingId, setEditingId] = useState(null);

    if (subcategories.length === 0) return null;

    return (
        <div className="space-y-2">
            {subcategories.map((sub) => {
                const isActive = activeSubCategory === sub.id;
                const isEditing = editingId === sub.id;
                const itemCount = sub?.raw?.items?.length ?? 0;

                return (
                    <div
                        key={sub.id}
                        className={cn(
                            "group relative overflow-hidden rounded-xl border transition-all duration-200",
                            sub.status === 'delete' ? "border-red-300 bg-red-50/50 opacity-60 pointer-events-none" :
                            isActive ? "border-primary/30 bg-primary/5 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/50"
                        )}
                    >
                        <div className={cn("absolute inset-y-2 left-1 w-1 rounded-full transition-all", isActive ? "bg-primary opacity-100" : "bg-primary opacity-0 group-hover:opacity-40")} />

                        {isEditing ? (
                            <div className="px-4 py-3">
                                <InlineInput
                                    autoFocus
                                    defaultValue={sub.name}
                                    onSubmit={(name) => {
                                        const trimmed = name.trim();
                                        if (trimmed && updateSubCategory) {
                                            updateSubCategory(sub.id, { name: trimmed });
                                        }
                                        setEditingId(null);
                                    }}
                                    onCancel={() => setEditingId(null)}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveCategory?.(categoryId);
                                        setActiveSubCategory?.(sub.id);
                                    }}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                    <div className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors", 
                                        sub.status === 'delete' ? "bg-red-100 text-red-500" :
                                        isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-background"
                                    )}>
                                        <FolderTree className="h-4 w-4" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className={cn("truncate text-sm font-medium flex items-center gap-2", sub.status === 'delete' ? "text-red-500" : isActive ? "text-foreground" : "text-muted-foreground")}>
                                            <span className="truncate">{sub.name}</span>
                                            {sub.id?.toString().startsWith("temp-") && (
                                                <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider shrink-0">NEW</span>
                                            )}
                                            {sub.temp_id?.toString().startsWith("update-") && !sub.id?.toString().startsWith("temp-") && (
                                                <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider shrink-0">UPDATE</span>
                                            )}
                                            {sub.status === 'delete' && (
                                                <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider shrink-0">DELETE</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Subcategory</p>
                                    </div>

                                    {itemCount > 0 && (
                                        <div className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                                            {itemCount}
                                        </div>
                                    )}
                                </button>

                                {!sub.status || sub.status !== 'delete' ? (
                                    <ActionMenu
                                        triggerClassName={cn(
                                            "h-7 w-7 opacity-0 transition-opacity",
                                            isActive ? "opacity-100" : "group-hover:opacity-100 data-[state=open]:opacity-100"
                                        )}
                                        onRename={() => setEditingId(sub.id)}
                                        onDelete={() => deleteSubCategory?.(sub.id)}
                                    />
                                ) : null}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}