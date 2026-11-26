import Menu from "@/model/menu";
import Restaurant from "@/model/restaurant";
import BypassTriggerRecord from "@/model/BypassTriggerRecord";
import OutletTransfer from "@/model/outletTransfer";

/**
 * Resolves the best human-readable restaurant name for a given resId.
 */
export async function getRestaurantName(resId, fallbackName = "") {
    if (fallbackName && fallbackName !== "Unknown Restaurant" && fallbackName !== "Restaurant" && fallbackName !== "Current Outlet") {
        return fallbackName.trim();
    }
    if (!resId) return fallbackName || "Unknown Restaurant";

    const sResId = String(resId).trim();
    
    try {
        // 1. Check Menu collection
        const menuDoc = await Menu.findOne({ resId: sResId, name: { $exists: true, $ne: "" } }).select("name").lean();
        if (menuDoc?.name?.trim()) return menuDoc.name.trim();

        // 2. Check Restaurant collection
        const restDoc = await Restaurant.findOne({ resId: sResId, name: { $exists: true, $ne: "" } }).select("name").lean();
        if (restDoc?.name?.trim()) return restDoc.name.trim();

        // 3. Check OutletTransfer collection
        const transferDoc = await OutletTransfer.findOne({
            $or: [{ fromResId: sResId }, { toResId: sResId }]
        }).sort({ createdAt: -1 }).select("fromResId fromResName toResId toResName").lean();
        if (transferDoc) {
            if (String(transferDoc.fromResId) === sResId && transferDoc.fromResName?.trim()) {
                return transferDoc.fromResName.trim();
            }
            if (String(transferDoc.toResId) === sResId && transferDoc.toResName?.trim()) {
                return transferDoc.toResName.trim();
            }
        }

        // 4. Check BypassTriggerRecord
        const bypassDoc = await BypassTriggerRecord.findOne({ resId: sResId, resName: { $exists: true, $ne: "" } }).sort({ createdAt: -1 }).select("resName").lean();
        if (bypassDoc?.resName?.trim()) return bypassDoc.resName.trim();
    } catch (e) {
        console.warn(`[getRestaurantName] Error resolving name for resId ${resId}:`, e?.message);
    }

    return fallbackName || `Outlet ${resId}`;
}

/**
 * Batch resolves restaurant names for an array of resIds in parallel.
 * Returns a map of: { [resId]: "Restaurant Name" }
 */
export async function batchResolveRestaurantNames(resIds = []) {
    const uniqueIds = Array.from(new Set(resIds.map(id => String(id || "").trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const nameMap = {};

    try {
        const [menus, rests, bypasses, transfers] = await Promise.all([
            Menu.find({ resId: { $in: uniqueIds }, name: { $exists: true, $ne: "" } }).select("resId name").lean(),
            Restaurant.find({ resId: { $in: uniqueIds }, name: { $exists: true, $ne: "" } }).select("resId name").lean(),
            BypassTriggerRecord.find({ resId: { $in: uniqueIds }, resName: { $exists: true, $ne: "" } }).select("resId resName").lean(),
            OutletTransfer.find({
                $or: [{ fromResId: { $in: uniqueIds } }, { toResId: { $in: uniqueIds } }]
            }).select("fromResId fromResName toResId toResName").lean()
        ]);

        uniqueIds.forEach(id => {
            const m = menus.find(doc => String(doc.resId) === id);
            if (m?.name?.trim()) { nameMap[id] = m.name.trim(); return; }

            const r = rests.find(doc => String(doc.resId) === id);
            if (r?.name?.trim()) { nameMap[id] = r.name.trim(); return; }

            const b = bypasses.find(doc => String(doc.resId) === id);
            if (b?.resName?.trim()) { nameMap[id] = b.resName.trim(); return; }

            const t = transfers.find(doc => String(doc.fromResId) === id || String(doc.toResId) === id);
            if (t) {
                if (String(t.fromResId) === id && t.fromResName?.trim()) { nameMap[id] = t.fromResName.trim(); return; }
                if (String(t.toResId) === id && t.toResName?.trim()) { nameMap[id] = t.toResName.trim(); return; }
            }

            nameMap[id] = `Outlet ${id}`;
        });
    } catch (e) {
        console.warn("[batchResolveRestaurantNames] Error batch resolving:", e?.message);
        uniqueIds.forEach(id => {
            if (!nameMap[id]) nameMap[id] = `Outlet ${id}`;
        });
    }

    return nameMap;
}

