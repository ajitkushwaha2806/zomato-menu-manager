"use client";

import { useState, useEffect, forwardRef , useRef , useImperativeHandle } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  AlertCircle, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Plus, Trash2, ImageIcon, ArrowUp, ArrowDown
} from "lucide-react";
import { openImageSidebar, clearTicketImageUpdate } from "@/store/slice/menuSlice";
import { toast } from "sonner";

const TicketCard = forwardRef(function TicketCard({ ticket }, ref) {
  const dispatch = useDispatch();
  const menuList = useSelector((state) => state.menu.menuData) || [];

  const {
    ticket_status,
    created_time,
    last_edited_time,
    ticket_reason,
    field_rejections = [],
    item = {},
  } = ticket;

  const itemName = item?.item?.name || "Unknown Item";
  const itemDesc = item?.item?.description || "";
  const itemPrice = item?.item?.price || 0;
  const isVeg = item?.item?.is_veg === "VEG";
  const imageUrl = item?.item?.image_url || item?.item?.s3_image_url || "";

  const [name, setName] = useState(itemName);
  const [price, setPrice] = useState(itemPrice);
  const [description, setDescription] = useState(itemDesc);
  const [isVegState, setIsVegState] = useState(isVeg ? "VEG" : (item?.item?.is_veg || "NONVEG"));
  const [imageUrlState, setImageUrlState] = useState(imageUrl);

  const variantGroups = item?.variant_groups_vo || [];
  const [variants, setVariants] = useState(() =>
    variantGroups.map(group => ({
      property_name: group.variant_group?.name || "",
      property_id: group.variant_group?.id || Date.now().toString(),
      options: (group.variants_vo || []).map(opt => ({
        option_name: opt.variant?.name || "",
        price: (opt.variant?.price || 0) + itemPrice,
        is_default: opt.variant?.default === 1,
        option_id: opt.variant?.id || Date.now().toString()
      }))
    }))
  );

  const [variantsExpanded, setVariantsExpanded] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState("");

  const ticketSubCatId = item?.sub_category_id;

  const initialVariantsStr = useRef(JSON.stringify(
    variantGroups.map(group => ({
      property_name: group.variant_group?.name || "",
      options: (group.variants_vo || []).map(opt => ({
        option_name: opt.variant?.name || "",
        price: (opt.variant?.price || 0) + itemPrice,
        is_default: opt.variant?.default === 1,
      }))
    }))
  ));

  const [isUpdated, setIsUpdated] = useState(false);

  useEffect(() => {
    const currentVariantsStr = JSON.stringify(
      variants.map(v => ({
        property_name: v.property_name,
        options: (v.options || []).map(o => ({
          option_name: o.option_name,
          price: o.price,
          is_default: o.is_default || false,
        }))
      }))
    );

    const initialVeg = isVeg ? "VEG" : (item?.item?.is_veg || "NONVEG");
    
    if (
      name !== itemName ||
      price !== itemPrice ||
      description !== itemDesc ||
      isVegState !== initialVeg ||
      imageUrlState !== imageUrl ||
      currentVariantsStr !== initialVariantsStr.current
    ) {
      setIsUpdated(true);
    } else {
      setIsUpdated(false);
    }
  }, [name, price, description, isVegState, imageUrlState, variants, itemName, itemPrice, itemDesc, isVeg, imageUrl]);

  useEffect(() => {
    if (menuList.length > 0) {
      let foundCatId = "";
      let foundSubCatId = "";

      if (ticketSubCatId) {
        for (const cat of menuList) {
          const subCats = cat.sub_category || cat.sub_categories || [];
          const sub = subCats.find(s => s.id === ticketSubCatId);
          if (sub) { foundCatId = cat.id; foundSubCatId = sub.id; break; }
        }
      }

      const ticketSubCatName = item?.sub_category_name;
      if (!foundSubCatId && ticketSubCatName) {
        for (const cat of menuList) {
          const subCats = cat.sub_category || cat.sub_categories || [];
          const sub = subCats.find(
            s => s.name?.toLowerCase() === ticketSubCatName?.toLowerCase()
          );
          if (sub) { foundCatId = cat.id; foundSubCatId = sub.id; break; }
        }
      }

      if (!foundSubCatId && menuList.length > 0) {
        foundCatId = menuList[0].id;
        const subs = menuList[0].sub_category || menuList[0].sub_categories || [];
        if (subs.length > 0) foundSubCatId = subs[0].id;
      }

      setSelectedCategoryId(foundCatId);
      setSelectedSubCategoryId(foundSubCatId);
    }
  }, [menuList, ticketSubCatId, item?.sub_category_name]);

  const ticketImageUpdate = useSelector(
    (state) => state.menu.ticketImageUpdates?.[ticket.ticket_id]
  );
  useEffect(() => {
    if (ticketImageUpdate) {
      setImageUrlState(ticketImageUpdate);
      dispatch(clearTicketImageUpdate(ticket.ticket_id));
    }
  }, [ticketImageUpdate, ticket.ticket_id, dispatch]);

  // Expose payload builder to parent
  useImperativeHandle(ref, () => ({
    getPayload: () => {
      if (!selectedSubCategoryId) return null;
      return {
        isUpdated: true, // Force true to ensure it queues
        subCategoryId: selectedSubCategoryId,
        item: {
          id: item?.item?.id || `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name,
          base_price: price,
          description,
          is_veg: isVegState,
          packing_charges: item?.item?.packing_charges || 0,
          media: imageUrlState ? [
            {
              url: imageUrlState,
              mediaId: item?.item?.image_id || null,
            }
          ] : [],
          image_url: imageUrlState,
          image_id: item?.item?.image_id || "",
          meatTypes: null,
          onHold: false,
          holdComments: [],
          addons: [],
          variants: variants.map(v => ({
            property_name: v.property_name,
            property_id: v.property_id || Date.now().toString(),
            options: (v.options || []).map(o => ({
              option_name: o.option_name,
              price: o.price,
              option_id: o.option_id || Date.now().toString(),
              is_default: o.is_default || false,
            }))
          }))
        }
      };
    },
    getItemName: () => name,
  }), [selectedSubCategoryId, name, price, description, isVegState, imageUrlState, variants, item, isUpdated]);

  // Variant helpers
  const addOption = (gIdx) => {
    setVariants(prev => prev.map((g, i) => i !== gIdx ? g : {
      ...g, options: [...g.options, { option_name: "New Option", price: price, option_id: Date.now().toString(), is_default: false }]
    }));
  };
  const removeOption = (gIdx, oIdx) => {
    setVariants(prev => prev.map((g, i) => i !== gIdx ? g : {
      ...g, options: g.options.filter((_, idx) => idx !== oIdx)
    }));
  };
  const updateOption = (gIdx, oIdx, field, value) => {
    setVariants(prev => prev.map((g, i) => i !== gIdx ? g : {
      ...g, options: g.options.map((o, j) => j !== oIdx ? o : { ...o, [field]: value })
    }));
  };
  const moveOption = (gIdx, oIdx, dir) => {
    setVariants(prev => prev.map((g, i) => {
      if (i !== gIdx) return g;
      const opts = [...g.options];
      const target = oIdx + dir;
      if (target < 0 || target >= opts.length) return g;
      [opts[oIdx], opts[target]] = [opts[target], opts[oIdx]];
      return { ...g, options: opts };
    }));
  };
  const addGroup = () => {
    setVariants(prev => [...prev, { property_name: "New Group", property_id: Date.now().toString(), options: [] }]);
    setVariantsExpanded(true);
  };
  const removeGroup = (gIdx) => setVariants(prev => prev.filter((_, i) => i !== gIdx));
  const updateGroup = (gIdx, value) => {
    setVariants(prev => prev.map((g, i) => i !== gIdx ? g : { ...g, property_name: value }));
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case "APPROVED": return { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 };
      case "REJECTED": return { color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle };
      case "PENDING_APPROVAL": return { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock };
      default: return { color: "bg-gray-100 text-gray-700 border-gray-200", icon: AlertCircle };
    }
  };
  const statusConfig = getStatusConfig(ticket_status);
  const StatusIcon = statusConfig.icon;

  const formatDate = (dateStr) => {
    try { return dateStr ? format(new Date(dateStr), "MMM d, yyyy h:mm a") : ""; }
    catch { return dateStr; }
  };

  const selectedCategory = menuList.find(c => c.id === selectedCategoryId);
  const subCategoriesForSelected = selectedCategory?.sub_category || selectedCategory?.sub_categories || [];

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
      {/* ITEM DETAILS */}
      {ticket_status === "REJECTED" ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            {/* image */}
            <div
              className={`relative shrink-0 rounded-lg overflow-hidden border transition-all duration-200 ${isDraggingOver ? "ring-2 ring-primary scale-105" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const url =
                  e.dataTransfer.getData("text/uri-list") ||
                  e.dataTransfer.getData("text/plain");
                if (url) {
                  setImageUrlState(url);
                  toast.success("Image updated!");
                }
              }}
            >
              <img
                src={imageUrlState || "https://placehold.co/200x200?text=Food"}
                alt={name}
                className="w-16 h-16 object-cover"
              />
              <button
                onClick={() =>
                  dispatch(
                    openImageSidebar({
                      id: ticket.ticket_id,
                      name,
                      isTicket: true,
                      ticketId: ticket.ticket_id,
                    }),
                  )
                }
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity backdrop-blur-[2px] rounded-lg"
                title="Change Image"
              >
                <ImageIcon className="text-white" size={20} />
              </button>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <select
                      value={isVegState}
                      onChange={(e) => setIsVegState(e.target.value)}
                      className="text-xs font-semibold px-2 py-1 rounded border border-gray-300 outline-none bg-white cursor-pointer shrink-0"
                    >
                      <option value="VEG">VEG</option>
                      <option value="NONVEG">NONVEG</option>
                      <option value="EGG">EGG</option>
                    </select>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Item Name"
                      className="flex-1 min-w-0 font-semibold text-base outline-none border-b border-gray-200 hover:border-gray-400 focus:border-primary px-1"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {[
                      { label: "Mock Meat", append: " - Mock Meat" },
                      { label: '🍕 6"', append: " - 6 INCH" },
                      { label: '🍕 7"', append: " - 7 INCH" },
                      { label: '🍕 8"', append: " - 8 INCH" },
                      { label: "4 pc", append: " - 4 PCS" },
                      { label: "5 pc", append: " - 5 PCS" },
                      { label: "6 pc", append: " - 6 PCS" },
                      { label: "S", append: " - SMALL" },
                      { label: "M", append: " - MEDIUM" },
                      { label: "L", append: " - LARGE" },
                      { label: "200ML", append: " - 200 ML" },
                      { label: "300ML", append: " - 300 ML" },
                      { label: "500ML", append: " - 500 ML" },
                      { label: "100G", append: " - 100 G" },
                      { label: "300G", append: " - 300 G" },
                      { label: "500G", append: " - 500 G" },
                      { label: "1KG", append: " - 1 KG" },
                    ].map((tag) => (
                      <button
                        key={tag.label}
                        type="button"
                        onClick={() => setName((prev) => (prev + tag.append).trimStart())}
                        className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 hover:bg-primary/10 hover:border-primary/40 hover:text-primary text-[9px] font-medium text-gray-600 transition-colors cursor-pointer select-none"
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 text-xs ${statusConfig.color}`}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  {ticket_status.replace("_", " ")}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <span>₹</span>
                <input
                  type="number"
                  value={price ?? ""}
                  onChange={(e) =>
                    setPrice(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder="Price"
                  className="w-20 outline-none border-b border-gray-200 hover:border-gray-400 focus:border-primary px-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter item description..."
              className="w-full text-xs border border-gray-200 rounded-lg p-2 outline-none hover:border-gray-300 focus:border-primary resize-none h-14"
            />
            {/* Quick-append description tags */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Mock Meat", append: " - [Mock Meat]" },
                { label: '🍕 6"', append: " - [6 INCH]" },
                { label: '🍕 7"', append: " - [7 INCH]" },
                { label: '🍕 8"', append: " - [8 INCH]" },
                { label: "4 pc", append: " - [4 PCS]" },
                { label: "5 pc", append: " - [5 PCS]" },
                { label: "6 pc", append: " - [6 PCS]" },
                { label: "S", append: " - [SMALL]" },
                { label: "M", append: " - [MEDIUM]" },
                { label: "L", append: " - [LARGE]" },
                { label: "200ML", append: " - [200 ML]" },
                { label: "300ML", append: " - [300 ML]" },
                { label: "500ML", append: " - [500 ML]" },
                { label: "100G", append: " - [100 G]" },
                { label: "300G", append: " - [300 G]" },
                { label: "500G", append: " - [500 G]" },
                { label: "1KG", append: " - [1 KG]" },
              ].map((tag) => (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() =>
                    setDescription((prev) => (prev + tag.append).trimStart())
                  }
                  className="inline-flex items-center px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-primary/10 hover:border-primary/40 hover:text-primary text-[10px] font-medium text-gray-600 transition-colors cursor-pointer select-none"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* READ-ONLY */
        <div className="flex gap-3">
          <div className="relative shrink-0 rounded-lg overflow-hidden border">
            <img
              src={imageUrl || "https://placehold.co/200x200?text=Food"}
              alt={itemName}
              className="w-16 h-16 object-cover"
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-sm border ${isVeg ? "border-green-600 bg-green-100" : "border-red-600 bg-red-100"} flex items-center justify-center shrink-0`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`}
                    />
                  </div>
                  <h3 className="font-semibold text-base text-gray-800 truncate">
                    {itemName}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 text-xs ${statusConfig.color}`}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  {ticket_status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-gray-700">
                ₹{itemPrice}
              </p>
              {itemDesc && (
                <p className="text-xs text-gray-500 line-clamp-2">{itemDesc}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VARIANTS */}
      {ticket_status === "REJECTED" ? (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setVariantsExpanded(!variantsExpanded)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              {variantsExpanded ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              Variants ({variants.length})
            </button>
            <button
              onClick={addGroup}
              className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-0.5"
            >
              <Plus size={12} /> Add Group
            </button>
          </div>

          {variantsExpanded && (
            <div className="mt-2.5 space-y-3">
              {variants.map((group, gIdx) => (
                <div
                  key={gIdx}
                  className="bg-slate-50 border border-gray-200 rounded-lg p-2.5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <input
                      type="text"
                      value={group.property_name}
                      onChange={(e) => updateGroup(gIdx, e.target.value)}
                      placeholder="Group Name (e.g., Size)"
                      className="font-semibold text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none px-1 w-1/2"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addOption(gIdx)}
                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        <Plus size={10} /> Add Option
                      </button>
                      <button
                        onClick={() => removeGroup(gIdx)}
                        className="text-[10px] text-red-500 hover:text-red-700 p-0.5"
                        title="Delete Group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {group.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className="flex items-center gap-1.5 bg-white border border-gray-100 rounded px-2 py-1 text-xs"
                      >
                        {/* up/down reorder */}
                        <div className="flex flex-col gap-px shrink-0">
                          <button
                            onClick={() => moveOption(gIdx, oIdx, -1)}
                            disabled={oIdx === 0}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowUp size={10} />
                          </button>
                          <button
                            onClick={() => moveOption(gIdx, oIdx, 1)}
                            disabled={oIdx === group.options.length - 1}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowDown size={10} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={opt.option_name}
                          onChange={(e) =>
                            updateOption(
                              gIdx,
                              oIdx,
                              "option_name",
                              e.target.value,
                            )
                          }
                          placeholder="Option name"
                          className="bg-transparent outline-none flex-1 min-w-0 text-gray-700"
                        />
                        <div className="flex items-center gap-0.5 font-semibold text-gray-700 w-16 shrink-0">
                          <span>₹</span>
                          <input
                            type="number"
                            value={opt.price}
                            onChange={(e) =>
                              updateOption(
                                gIdx,
                                oIdx,
                                "price",
                                Number(e.target.value),
                              )
                            }
                            placeholder="0"
                            className="w-full text-right bg-transparent outline-none"
                          />
                        </div>
                        <button
                          onClick={() => removeOption(gIdx, oIdx)}
                          className="text-red-400 hover:text-red-600 font-bold px-0.5 shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {group.options.length === 0 && (
                      <p className="text-[10px] text-gray-400 italic">
                        No options yet.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        variantGroups.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <button
              onClick={() => setVariantsExpanded(!variantsExpanded)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              {variantsExpanded ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              Variants ({variantGroups.length})
            </button>
            {variantsExpanded && (
              <div className="mt-2.5 space-y-3">
                {variantGroups.map((group, gIdx) => {
                  const options = group?.variants_vo || [];
                  return (
                    <div
                      key={gIdx}
                      className="bg-slate-50/70 border rounded-lg p-2.5"
                    >
                      <span className="font-semibold text-xs text-gray-600 block mb-2">
                        {group?.variant_group?.name || "Variant Group"}
                      </span>
                      <div className="space-y-1.5">
                        {options.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            className="flex items-center justify-between bg-white border border-gray-100 rounded px-2.5 py-1 text-xs"
                          >
                            <span className="text-gray-700">
                              {opt?.variant?.name || "Option"}
                            </span>
                            <span className="font-semibold text-gray-700">
                              ₹{(opt?.variant?.price || 0) + itemPrice}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {/* SUBCATEGORY PICKER */}
      {ticket_status === "REJECTED" && (
        <div className="bg-slate-50 border border-gray-200 rounded-xl p-3 space-y-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            Add to Menu Subcategory
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-semibold text-gray-500 uppercase">
                Category
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => {
                  const catId = e.target.value;
                  setSelectedCategoryId(catId);
                  const cat = menuList.find((c) => c.id === catId);
                  const subs = cat?.sub_category || [];
                  setSelectedSubCategoryId(subs.length > 0 ? subs[0].id : "");
                }}
                className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-primary"
              >
                {menuList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-semibold text-gray-500 uppercase">
                Subcategory
              </label>
              <select
                value={selectedSubCategoryId}
                onChange={(e) => setSelectedSubCategoryId(e.target.value)}
                className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-primary"
                disabled={subCategoriesForSelected.length === 0}
              >
                {subCategoriesForSelected.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
                {subCategoriesForSelected.length === 0 && (
                  <option value="">No Subcategories</option>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TICKET META */}
      <div className="flex items-center gap-4 flex-wrap text-[10px] text-gray-500 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
        <div className="flex flex-col">
          <span className="font-medium text-gray-400 uppercase tracking-wider">
            Action
          </span>
          <span className="text-gray-700 font-medium">
            {ticket_reason?.replace("_", " ") || "UNKNOWN"}
          </span>
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex flex-col">
          <span className="font-medium text-gray-400 uppercase tracking-wider">
            Created
          </span>
          <span className="text-gray-700 font-medium">
            {formatDate(created_time)}
          </span>
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex flex-col">
          <span className="font-medium text-gray-400 uppercase tracking-wider">
            Last Edited
          </span>
          <span className="text-gray-700 font-medium">
            {formatDate(last_edited_time)}
          </span>
        </div>
      </div>

      {/* REJECTION REASONS */}
      {field_rejections?.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Rejection Reasons
          </h4>
          <div className="space-y-1.5">
            {field_rejections.map((rejection, idx) => (
              <div
                key={idx}
                className="bg-red-50/50 border border-red-100 p-2.5 rounded-lg text-xs"
              >
                <span className="font-semibold text-red-800 block mb-1">
                  Field: {rejection.field}
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-red-600">
                  {rejection.reasons.map((reason, i) => (
                    <li key={i} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADDITIONAL COMMENTS */}
      {(ticket.comments || ticket.item?.item?.comment) && (
        <div className="space-y-1.5 mt-2">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Comments & Errors
          </h4>
          <div className="bg-orange-50/50 border border-orange-100 p-2.5 rounded-lg text-xs space-y-2">
            {ticket.comments && (
              <div>
                <span className="font-semibold text-orange-800 block mb-0.5">Ticket Comment:</span>
                <span className="text-orange-700 leading-relaxed break-words whitespace-pre-wrap">{ticket.comments}</span>
              </div>
            )}
            {ticket.item?.item?.comment && (
              <div>
                <span className="font-semibold text-orange-800 block mb-0.5">Item Comment:</span>
                <span className="text-orange-700 leading-relaxed break-words whitespace-pre-wrap">{ticket.item.item.comment}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default TicketCard;
