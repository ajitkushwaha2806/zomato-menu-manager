import { Trash2, Plus, ImageIcon, ChevronDown, ChevronUp, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import useNotification from "@/store/hooks/useNotification";
import { useMenu } from "@/store/hooks/useMenu";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import ZomatoImageDropzone from "../../shared/ZomatoImageDropzone";
import { openImageSidebar } from "@/store/slice/menuSlice";

const MEAT_TYPES = [
    { slug: "chicken", label: "Chicken" }, { slug: "fish", label: "Fish" }, { slug: "mutton", label: "Mutton" },
    { slug: "goat", label: "Goat" }, { slug: "lamb", label: "Lamb" }, { slug: "pork", label: "Pork" },
    { slug: "egg", label: "Egg" }, { slug: "turkey", label: "Turkey" }, { slug: "beef", label: "Beef" },
    { slug: "buffalo", label: "Buffalo" }, { slug: "bull", label: "Bull" }, { slug: "crab", label: "Crab" },
    { slug: "prawn", label: "Prawn" }, { slug: "shrimp", label: "Shrimp" }, { slug: "shellfish", label: "Shellfish" },
    { slug: "squid", label: "Squid" }, { slug: "lobster", label: "Lobster" }, { slug: "duck", label: "Duck" },
    { slug: "camel", label: "Camel" }, { slug: "deer", label: "Deer" }, { slug: "frog", label: "Frog" },
    { slug: "goose", label: "Goose" }, { slug: "insect", label: "Insect" }, { slug: "octopus", label: "Octopus" },
    { slug: "pigeon", label: "Pigeon" }, { slug: "quail", label: "Quail" }, { slug: "rabbit", label: "Rabbit" },
    { slug: "shark", label: "Shark" }, { slug: "veal", label: "Veal" }, { slug: "venison", label: "Venison" }
];

export default function MenuItemRow({
    item,
    onChange,
    onDelete,
    categories,
    isAllItemsView,
    isDuplicate
}) {
    const { activeResId } = useSelector((state) => state.menu);
    const dispatch = useDispatch();
    const notification = useNotification();
    const { addonsData, toggleItemAddon } = useMenu();

    const [isHovered, setIsHovered] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);

    const updateField = (field, value) => {
        onChange?.({
            [field]: value,
        });
    };

    const variants = item?.variants || [];

    const addVariantGroup = () => {
        if (variants && variants.length >= 1) {
            notification.error("Only a single variant property is allowed.", { duration: 5000 });
            return;
        }
        const newGroup = {
            property_name: "New Group",
            property_id: `temp-${crypto.randomUUID()}`,
            options: []
        };
        updateField("variants", [...variants, newGroup]);
    };

    const updateVariantGroup = (groupIndex, field, value) => {
        const newVariants = [...variants];
        newVariants[groupIndex] = { ...newVariants[groupIndex], [field]: value };
        updateField("variants", newVariants);
    };

    const deleteVariantGroup = (groupIndex) => {
        const newVariants = variants.filter((_, idx) => idx !== groupIndex);
        updateField("variants", newVariants);
    };

    const addVariantOption = (groupIndex) => {
        const newVariants = [...variants];
        const group = { ...newVariants[groupIndex] };
        group.options = [
            ...(group.options || []),
            { option_name: "New Option", price: 0, is_default: false, option_id: `temp-${crypto.randomUUID()}` }
        ];
        newVariants[groupIndex] = group;
        updateField("variants", newVariants);
    };

    const updateVariantOption = (groupIndex, optionIndex, field, value) => {
        const newVariants = [...variants];
        const group = { ...newVariants[groupIndex] };
        const newOptions = [...(group.options || [])];
        newOptions[optionIndex] = { ...newOptions[optionIndex], [field]: value };

        group.options = newOptions;
        newVariants[groupIndex] = group;
        updateField("variants", newVariants);
    };

    const deleteVariantOption = (groupIndex, optionIndex) => {
        const newVariants = [...variants];
        const group = { ...newVariants[groupIndex] };
        group.options = (group.options || []).filter((_, idx) => idx !== optionIndex);
        newVariants[groupIndex] = group;
        updateField("variants", newVariants);
    };

    const SUGGESTED_VARIANTS = [
        { property_name: "Size", options: ["Small", "Medium", "Large"] },
        { property_name: "Quantity", options: ["Half", "Full"] },
        { property_name: "Pieces", options: ["1 pc", "2 pcs", "4 pcs"] }
    ];

    const addSuggestedVariant = (suggestion) => {
        if (variants && variants.length >= 1) {
            notification.error("Only a single variant property is allowed.", { duration: 5000 });
            return;
        }
        const newGroup = {
            property_name: suggestion.property_name,
            property_id: `temp-${crypto.randomUUID()}`,
            options: suggestion.options.map(opt => ({
                option_name: opt,
                price: 0,
                is_default: false,
                option_id: `temp-${crypto.randomUUID()}`
            }))
        };
        updateField("variants", [...variants, newGroup]);
    };

    return (
        <div
            className={`group border rounded-xl p-3 transition-all mb-3 relative ${
                item?.status === 'delete' ? "bg-red-50 border-red-300 pointer-events-none opacity-60" :
                item?.id?.toString().startsWith("temp-") 
                    ? "bg-green-50/50 border-green-300 hover:border-green-500"
                    : isDuplicate
                    ? "bg-red-50/30 border-red-300 hover:border-red-400"
                    : "bg-white hover:border-orange-300"
            }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {item?.id?.toString().startsWith("temp-") && item?.status !== 'delete' && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 uppercase tracking-wider">
                    NEW
                </div>
            )}
            {item?.temp_id?.toString().startsWith("update-") && !item?.id?.toString().startsWith("temp-") && item?.status !== 'delete' && (
                <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 uppercase tracking-wider">
                    UPDATE
                </div>
            )}
            {item?.status === 'delete' && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 uppercase tracking-wider">
                    DELETE
                </div>
            )}
            <div className="flex gap-3">
                <ZomatoImageDropzone
                    itemId={item?.id}
                    itemName={item?.name}
                    className="shrink-0 rounded-lg overflow-hidden border transition-all duration-200 hover:ring-2 hover:ring-primary/50 group/img h-16 w-16 relative"
                    onUploadSuccess={(mediaArray) => {
                        updateField("media", mediaArray);
                    }}
                >
                    {item?.media?.[0]?.isUploading ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 p-1 text-center">
                            <Loader2 className="animate-spin mb-1" size={20} />
                            <span className="text-[8px] font-bold uppercase tracking-wider leading-[10px]">
                                {item?.media?.[0]?.uploadText || "Processing"}
                            </span>
                        </div>
                    ) : (
                        <img
                            src={
                                item?.media?.[0]?.url || item?.media?.[0]?.thumbUrl ||
                                item?.image_url ||
                                item?.image ||
                                "https://placehold.co/200x200?text=Food"
                            }
                            alt={item?.name || "Item"}
                            className="w-full h-full object-cover"
                        />
                    )}
                    {item?.media?.[0]?.mediaTags?.some?.(t => t.tagSlug === "rejected") ? (
                        <div className="absolute inset-x-0 bottom-0 bg-red-500 text-white text-[9px] font-bold text-center py-0.5 z-10">
                           REJECTED
                        </div>
                    ) : item?.media?.[0]?.onHoldStatus === 2 ? (
                        <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-white text-[9px] font-bold text-center py-0.5 z-10">
                           ON HOLD
                        </div>
                    ) : (item?.media?.[0]?.id?.toString().startsWith("temp-") || item?.media?.[0]?.tempReferenceId?.toString().startsWith("temp-") || item?.media?.[0]?.isNewlyUploaded) ? (
                        <div className="absolute top-1 left-1 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow z-10 uppercase tracking-wider">
                           NEW
                        </div>
                    ) : null}
                    <button
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-[2px] rounded-lg z-0"
                        title="Change Image"
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatch(openImageSidebar(item));
                        }}
                    >
                        <ImageIcon className="text-white" size={24} />
                    </button>
                </ZomatoImageDropzone>

                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                    <div className="space-y-2">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 flex items-center gap-3">
                                {isAllItemsView && categories && (
                                    <Select
                                        value={item?._parentSubCategoryId || ""}
                                        onValueChange={(val) => updateField("_parentSubCategoryId", val)}
                                    >
                                        <SelectTrigger className="w-fit max-w-[150px] h-7 text-[11px] bg-white border-primary/20 hover:bg-muted text-primary font-bold rounded-md">
                                            <SelectValue placeholder="Select Subcategory" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map((cat) => (
                                                <SelectGroup key={cat.id}>
                                                    <SelectLabel className="bg-gray-50 text-gray-500 font-semibold text-xs">{cat.name}</SelectLabel>
                                                    {(cat.sub_category || []).map((sub) => (
                                                        <SelectItem key={sub.id} value={sub.id} className="font-medium text-xs">
                                                            {sub.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <Select
                                    value={item?.is_veg || "UNKNOWN"}
                                    onValueChange={(val) => updateField("is_veg", val)}
                                >
                                    <SelectTrigger className={`w-fit h-7 text-[11px] font-bold rounded-md ${item?.is_veg === "VEG" ? "border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100" :
                                        item?.is_veg === "NON_VEG" ? "border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100" :
                                            item?.is_veg === "EGG" ? "border-yellow-300 text-yellow-700 bg-yellow-50/50 hover:bg-yellow-100" :
                                                "border-dashed border-red-300 text-red-500 bg-red-50/30 hover:bg-red-50"
                                        }`}>
                                        <SelectValue placeholder="Select Diet" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="VEG" className="text-xs font-medium">VEG</SelectItem>
                                        <SelectItem value="NON_VEG" className="text-xs font-medium">NON-VEG</SelectItem>
                                        <SelectItem value="EGG" className="text-xs font-medium">EGG</SelectItem>
                                        <SelectItem value="UNKNOWN" className="text-xs font-medium text-gray-500">Unknown</SelectItem>
                                    </SelectContent>
                                </Select>
                                {item?.is_veg === "NON_VEG" && (
                                    <Select
                                        value={item?.meatTypes?.[0] || ""}
                                        onValueChange={(val) => updateField("meatTypes", [val])}
                                    >
                                        <SelectTrigger className="w-fit max-w-[120px] h-7 text-[11px] font-bold rounded-md border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100">
                                            <SelectValue placeholder="Meat Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {MEAT_TYPES.map(meat => (
                                                <SelectItem key={meat.slug} value={meat.slug} className="text-xs font-medium">
                                                    {meat.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <input
                                    type="text"
                                    value={item?.name || ""}
                                    onChange={(e) => updateField("name", e.target.value)}
                                    placeholder="Item name"
                                    className={`flex-1 font-semibold placeholder:text-gray-400 outline-none bg-transparent ${!item?.name?.trim() ? "border-b border-red-500 text-red-500" : "text-gray-800"
                                        }`}
                                />
                                {isDuplicate && (
                                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                                        Duplicate
                                    </span>
                                )}
                                {(item?.base_price === 0 || item?.price === 0) && (
                                    <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shadow-sm" title="Price cannot be 0">
                                        Price Missing
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 font-semibold">
                                <span className="text-gray-500">₹</span>
                                <input
                                    type="number"
                                    value={item?.base_price ?? ""}
                                    onChange={(e) => updateField("base_price", e.target.value === "" ? "" : Number(e.target.value))}
                                    placeholder="0"
                                    className={`w-20 text-right outline-none bg-transparent ${item?.base_price === "" || item?.base_price === null || item?.base_price === undefined ? "border-b border-red-500 text-red-500" : "text-gray-800"
                                        }`}
                                />
                            </div>
                        </div>

                        <input
                            type="text"
                            value={item?.description || ""}
                            onChange={(e) => updateField("description", e.target.value)}
                            placeholder="Description"
                            className={`w-full text-sm placeholder:text-gray-400 outline-none bg-transparent ${!item?.description?.trim() ? "border-b border-red-500 text-red-500" : "text-gray-500"
                                }`}
                        />
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                    <button
                        onClick={() => onDelete?.(item)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                        title="Delete Item"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-dashed">
                {variants.length > 0 ? (
                    <div className="space-y-3">
                        {variants.map((group, gIdx) => (
                            <div key={gIdx} className="bg-slate-50 border rounded-lg p-2.5">
                                <div className="flex items-center gap-2 mb-2.5">
                                    <input
                                        type="text"
                                        value={group.property_name || ""}
                                        onChange={(e) => updateVariantGroup(gIdx, "property_name", e.target.value)}
                                        placeholder="Property (e.g. Size)"
                                        className="text-[11px] font-bold bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-primary w-[140px] shadow-sm"
                                    />
                                    {group.property_id?.toString().startsWith("temp-") && (
                                        <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider shrink-0">NEW</span>
                                    )}
                                    <button
                                        onClick={() => addVariantOption(gIdx)}
                                        className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20 flex items-center gap-1 transition-colors"
                                    >
                                        <Plus size={10} strokeWidth={3} /> Add Option
                                    </button>
                                    <div className="flex-1"></div>
                                    <button
                                        onClick={() => deleteVariantGroup(gIdx)}
                                        className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                                        title="Delete Group"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {(group.options || []).map((opt, oIdx) => (
                                        <div key={oIdx} className="flex items-stretch bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                                            {opt.option_id?.toString().startsWith("temp-") && (
                                                <div className="bg-green-500 flex items-center justify-center px-1.5 border-r border-green-600">
                                                    <span className="text-white text-[9px] font-bold uppercase tracking-wider shrink-0">NEW</span>
                                                </div>
                                            )}
                                            <input
                                                type="text"
                                                value={opt.option_name || ""}
                                                onChange={(e) => updateVariantOption(gIdx, oIdx, "option_name", e.target.value)}
                                                placeholder="Option"
                                                className="text-[11px] font-semibold bg-transparent outline-none w-20 px-2 py-1"
                                            />
                                            <div className="flex items-center bg-gray-50 border-l border-r border-gray-100">
                                                <span className="text-gray-400 text-[10px] font-medium pl-1.5">₹</span>
                                                <input
                                                    type="number"
                                                    value={opt.price || ""}
                                                    onChange={(e) => updateVariantOption(gIdx, oIdx, "price", Number(e.target.value))}
                                                    placeholder="0"
                                                    className="text-[11px] font-semibold w-12 bg-transparent outline-none py-1 px-1"
                                                />
                                            </div>
                                            <button
                                                onClick={() => deleteVariantOption(gIdx, oIdx)}
                                                className="bg-gray-50 px-1.5 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                title="Remove Option"
                                            >
                                                <X size={12} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!group.options || group.options.length === 0) && (
                                        <span className="text-[10px] text-gray-400 italic py-1 px-1">No options yet</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {variants.length < 1 && (
                            <div className="flex items-center justify-between flex-wrap gap-3 mt-2">
                                <button
                                    onClick={addVariantGroup}
                                    className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                                >
                                    <Plus size={12} strokeWidth={3} /> Add Custom
                                </button>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-2">Quick Add:</span>
                                    {SUGGESTED_VARIANTS.map(sug => (
                                        <button
                                            key={sug.property_name}
                                            onClick={() => addSuggestedVariant(sug)}
                                            className="text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={10} /> {sug.property_name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <button
                            onClick={addVariantGroup}
                            className="text-[11px] font-bold text-gray-500 hover:text-primary hover:border-primary flex items-center gap-1.5 border border-dashed border-gray-300 rounded-md px-3 py-1.5 transition-colors"
                        >
                            <Plus size={12} strokeWidth={3} /> Add Variants
                        </button>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">Suggestions:</span>
                            {SUGGESTED_VARIANTS.map(sug => (
                                <button
                                    key={sug.property_name}
                                    onClick={() => addSuggestedVariant(sug)}
                                    className="text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                                >
                                    <Plus size={10} /> {sug.property_name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {addonsData && addonsData.length > 0 && (
                <div className="mt-4 pt-3 border-t border-dashed">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Addons</div>
                    <div className="flex flex-wrap gap-2">
                        {addonsData.map(addon => {
                            const isSelected = (item?.addons || []).includes(addon.id);
                            return (
                                <button
                                    key={addon.id}
                                    onClick={() => toggleItemAddon(item.id, addon.id)}
                                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors border ${
                                        isSelected 
                                            ? "bg-primary/10 text-primary border-primary/30 shadow-sm" 
                                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                    }`}
                                >
                                    {addon.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
