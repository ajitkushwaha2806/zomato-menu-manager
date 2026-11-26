import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Trigger from "@/model/trigger";
import MenuSync from "@/model/menu-sync";
import OutletTransfer from "@/model/outletTransfer";
import BypassTriggerRecord from "@/model/BypassTriggerRecord";
import { batchResolveRestaurantNames } from "@/lib/restaurantResolver";

export const dynamic = "force-dynamic";

export async function GET(req) {
    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const period = searchParams.get("period") || "today";
        const startDateParam = searchParams.get("startDate");
        const endDateParam = searchParams.get("endDate");

        let start;
        let end;

        const now = new Date();

        if (startDateParam && endDateParam) {
            start = new Date(startDateParam);
            end = new Date(endDateParam);
        } else if (period === "today") {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (period === "yesterday") {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
            end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        } else if (period === "7days" || period === "week") {
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            end = new Date(now);
            end.setHours(23, 59, 59, 999);
        } else if (period === "30days" || period === "month") {
            start = new Date(now);
            start.setDate(start.getDate() - 30);
            start.setHours(0, 0, 0, 0);
            end = new Date(now);
            end.setHours(23, 59, 59, 999);
        } else if (period === "all") {
            start = new Date(0);
            end = new Date(2100, 0, 1);
        } else {
            // Default to today
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        }

        const dateQuery = {
            createdAt: {
                $gte: start,
                $lte: end,
            },
        };

        // Query all 4 operational collections in parallel
        const [rawTriggers, rawSyncs, rawTransfers, rawBypasses] = await Promise.all([
            Trigger.find(dateQuery).sort({ createdAt: -1 }).lean(),
            MenuSync.find(dateQuery).sort({ createdAt: -1 }).lean(),
            OutletTransfer.find(dateQuery).sort({ createdAt: -1 }).lean(),
            BypassTriggerRecord.find(dateQuery).sort({ createdAt: -1 }).lean(),
        ]);

        // Collect all distinct restaurant IDs across all collections
        const allResIds = new Set();
        rawTriggers.forEach(t => t.resId && allResIds.add(String(t.resId)));
        rawSyncs.forEach(s => s.resId && allResIds.add(String(s.resId)));
        rawTransfers.forEach(t => {
            if (t.fromResId) allResIds.add(String(t.fromResId));
            if (t.toResId) allResIds.add(String(t.toResId));
        });
        rawBypasses.forEach(b => b.resId && allResIds.add(String(b.resId)));

        // Batch resolve all restaurant names from Menus, Restaurants, Transfers, and BypassRecords
        const nameMap = await batchResolveRestaurantNames(Array.from(allResIds));

        // Format Triggers with resolved restaurant names
        const triggers = rawTriggers.map(t => {
            const resolvedName = t.restaurantName && !t.restaurantName.startsWith("Outlet ")
                ? t.restaurantName
                : (nameMap[String(t.resId)] || `Outlet ${t.resId}`);

            return {
                ...t,
                restaurantName: resolvedName,
                user: t.user || "Team Member",
                actionType: t.actionType || (t.platform === "petpooja" ? "Petpooja Publish" : "Menu Trigger"),
            };
        });

        // Format Syncs with resolved restaurant names
        const syncs = rawSyncs.map(s => {
            const resolvedName = s.restaurantName && !s.restaurantName.startsWith("Outlet ")
                ? s.restaurantName
                : (nameMap[String(s.resId)] || s.accountName || `Outlet ${s.resId}`);

            return {
                ...s,
                restaurantName: resolvedName,
                user: s.user || s.accountName || "Team Member",
                platform: s.platform || "unknown",
            };
        });

        // Format Transfers with resolved restaurant names
        const transfers = rawTransfers.map(t => ({
            ...t,
            fromResName: t.fromResName || nameMap[String(t.fromResId)] || `Outlet ${t.fromResId}`,
            toResName: t.toResName || nameMap[String(t.toResId)] || `Outlet ${t.toResId}`,
            user: t.user || "Team Member",
        }));

        // Group operations by distinct outlet to show "Today We Worked On These Outlets"
        const outletsMap = new Map();

        const touchOutlet = (resId, resName, platform, actionObj) => {
            if (!resId) return;
            const sId = String(resId);
            if (!outletsMap.has(sId)) {
                outletsMap.set(sId, {
                    resId: sId,
                    restaurantName: resName || nameMap[sId] || `Outlet ${sId}`,
                    platforms: new Set(),
                    totalActions: 0,
                    triggersCount: 0,
                    syncsCount: 0,
                    transfersCount: 0,
                    successCount: 0,
                    failCount: 0,
                    users: new Set(),
                    latestTimestamp: actionObj.createdAt,
                    latestAction: actionObj.type,
                    latestStatus: actionObj.status,
                    actions: [],
                });
            }

            const record = outletsMap.get(sId);
            if (platform) record.platforms.add(platform);
            if (actionObj.user && actionObj.user !== "System") record.users.add(actionObj.user);
            record.totalActions += 1;

            if (actionObj.type === "Menu Trigger" || actionObj.type === "Petpooja Publish") {
                record.triggersCount += 1;
            } else if (actionObj.type === "Menu Sync") {
                record.syncsCount += 1;
            } else if (actionObj.type === "Outlet Transfer") {
                record.transfersCount += 1;
            }

            if (actionObj.status === "SUCCESS" || actionObj.status === "completed" || actionObj.status === "COMPLETED") {
                record.successCount += 1;
            } else if (actionObj.status === "FAILED" || actionObj.status === "failed") {
                record.failCount += 1;
            }

            if (new Date(actionObj.createdAt) >= new Date(record.latestTimestamp)) {
                record.latestTimestamp = actionObj.createdAt;
                record.latestAction = actionObj.type;
                record.latestStatus = actionObj.status;
            }

            record.actions.push(actionObj);
        };

        // Populate from Triggers
        triggers.forEach(t => {
            touchOutlet(t.resId, t.restaurantName, t.platform, {
                id: t._id,
                type: t.actionType === "PETPOOJA_PUBLISH" ? "Petpooja Publish" : "Menu Trigger",
                platform: t.platform,
                status: t.status,
                user: t.user || "Team Member",
                taskId: t.taskId,
                error: t.error,
                createdAt: t.createdAt,
            });
        });

        // Populate from Syncs
        syncs.forEach(s => {
            touchOutlet(s.resId, s.restaurantName, s.platform, {
                id: s._id,
                type: "Menu Sync",
                platform: s.platform,
                status: s.status,
                user: s.user || s.accountName || "Team Member",
                taskId: s.taskId,
                error: s.error,
                createdAt: s.createdAt,
            });
        });

        // Populate from Transfers (both source and destination)
        transfers.forEach(t => {
            touchOutlet(t.fromResId, t.fromResName, t.platform, {
                id: t._id,
                type: "Outlet Transfer (Source)",
                platform: t.platform,
                status: t.status,
                user: t.user || "Team Member",
                details: t.details,
                createdAt: t.createdAt,
            });
            touchOutlet(t.toResId, t.toResName, t.platform, {
                id: t._id,
                type: "Outlet Transfer (Target)",
                platform: t.platform,
                status: t.status,
                user: t.user || "Team Member",
                details: t.details,
                createdAt: t.createdAt,
            });
        });

        // Convert outletsMap to array and sort by most recent activity
        const outletsWorkedOn = Array.from(outletsMap.values()).map(o => ({
            ...o,
            platforms: Array.from(o.platforms),
            users: Array.from(o.users),
            actions: o.actions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        })).sort((a, b) => new Date(b.latestTimestamp) - new Date(a.latestTimestamp));

        // Build unified chronological activity feed across everyone
        const feed = [
            ...triggers.map(t => ({
                id: `trigger_${t._id}`,
                resId: t.resId,
                restaurantName: t.restaurantName,
                platform: t.platform,
                type: t.actionType === "PETPOOJA_PUBLISH" ? "Petpooja Publish" : "Menu Trigger",
                status: t.status,
                user: t.user || "Team Member",
                taskId: t.taskId,
                error: t.error,
                createdAt: t.createdAt,
            })),
            ...syncs.map(s => ({
                id: `sync_${s._id}`,
                resId: s.resId,
                restaurantName: s.restaurantName,
                platform: s.platform,
                type: "Menu Sync",
                status: s.status,
                user: s.user || s.accountName || "Team Member",
                taskId: s.taskId,
                error: s.error,
                createdAt: s.createdAt,
            })),
            ...transfers.map(t => ({
                id: `transfer_${t._id}`,
                resId: t.toResId,
                restaurantName: `${t.fromResName} → ${t.toResName}`,
                platform: t.platform,
                type: "Outlet Transfer",
                status: t.status,
                user: t.user || "Team Member",
                details: t.details,
                createdAt: t.createdAt,
            })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Distinct team members active in this period
        const teamMembersSet = new Set();
        feed.forEach(item => {
            if (item.user && item.user !== "System" && item.user !== "Unknown User" && item.user !== "Team Member") {
                teamMembersSet.add(item.user);
            }
        });

        // Calculate summary metrics
        const totalActions = triggers.length + syncs.length + transfers.length;
        const successCount = triggers.filter(t => t.status === "SUCCESS").length +
            syncs.filter(s => s.status === "completed").length +
            transfers.filter(t => t.status === "COMPLETED").length;
        const failCount = triggers.filter(t => t.status === "FAILED").length +
            syncs.filter(s => s.status === "failed").length;

        const successRate = totalActions > 0
            ? Math.round((successCount / totalActions) * 100)
            : 100;

        return NextResponse.json({
            success: true,
            period,
            dateRange: {
                start: start.toISOString(),
                end: end.toISOString(),
            },
            summary: {
                totalOutletsWorkedOn: outletsWorkedOn.length,
                totalActions,
                triggersCount: triggers.length,
                syncsCount: syncs.length,
                transfersCount: transfers.length,
                successCount,
                failCount,
                successRate: `${successRate}%`,
                teamMembers: Array.from(teamMembersSet),
                teamMembersCount: teamMembersSet.size,
            },
            outletsWorkedOn,
            feed,
            triggers,
            syncs,
            transfers,
        });
    } catch (error) {
        console.error("Analytics Route Error:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to generate analytics" },
            { status: 500 }
        );
    }
}

