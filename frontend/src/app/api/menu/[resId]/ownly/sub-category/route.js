import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/menu/[resId]/ownly/sub-category
 * Creates a subcategory under a category in the MongoDB Ownly menu.
 */
export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID is required." },
                { status: 400 }
            );
        }

        const body = await req.json();
        const { categoryId, name } = body;

        if (!categoryId) {
            return NextResponse.json(
                { success: false, message: "categoryId is required." },
                { status: 400 }
            );
        }

        const subName = (name || "").trim();
        if (!subName) {
            return NextResponse.json(
                { success: false, message: "Subcategory name is required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json(
                { success: false, message: "Menu not found for this restaurant." },
                { status: 404 }
            );
        }

        const cat = menuDoc.menu.find((c) => String(c.id) === String(categoryId));
        if (!cat) {
            return NextResponse.json(
                { success: false, message: `Category #${categoryId} not found.` },
                { status: 404 }
            );
        }

        const newSubId = body.id || `temp_subcategory_${crypto.randomUUID()}`;
        const newSub = {
            id: newSubId,
            temp_id: newSubId.startsWith("temp") ? newSubId : "",
            name: subName,
            items: [],
        };

        if (!Array.isArray(cat.sub_category)) cat.sub_category = [];
        cat.sub_category.push(newSub);

        await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });

        return NextResponse.json({
            success: true,
            message: "Subcategory created successfully",
            sub_category: newSub,
        });
    } catch (err) {
        console.error("Ownly Create Subcategory Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to create subcategory" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/menu/[resId]/ownly/sub-category
 * Renames/updates a subcategory in MongoDB
 */
export async function PUT(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const { id, name } = body;

        if (!id || !name?.trim()) {
            return NextResponse.json(
                { success: false, message: "Subcategory ID and new name are required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        let foundSub = null;
        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                if (String(sub.id) === String(id)) {
                    sub.name = name.trim();
                    foundSub = sub;
                    break;
                }
            }
            if (foundSub) break;
        }

        if (!foundSub) {
            return NextResponse.json({ success: false, message: "Subcategory not found" }, { status: 404 });
        }

        await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });

        return NextResponse.json({
            success: true,
            message: "Subcategory updated successfully",
            sub_category: foundSub,
        });
    } catch (err) {
        console.error("Ownly Update Subcategory Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to update subcategory" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/menu/[resId]/ownly/sub-category
 * Deletes subcategory from MongoDB
 */
export async function DELETE(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const subCategoryIds = Array.isArray(body.sub_category_ids) ? body.sub_category_ids : [body.id].filter(Boolean);

        if (subCategoryIds.length === 0) {
            return NextResponse.json(
                { success: false, message: "sub_category_ids array is required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        const idSet = new Set(subCategoryIds.map(String));
        for (const cat of menuDoc.menu) {
            if (Array.isArray(cat.sub_category)) {
                cat.sub_category = cat.sub_category.filter((s) => !idSet.has(String(s.id)));
            }
        }

        await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });

        return NextResponse.json({
            success: true,
            message: "Subcategory deleted successfully",
        });
    } catch (err) {
        console.error("Ownly Delete Subcategory Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to delete subcategory" },
            { status: 500 }
        );
    }
}

