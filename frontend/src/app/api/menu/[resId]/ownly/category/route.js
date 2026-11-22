import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/menu/[resId]/ownly/category
 * Creates a category in the MongoDB Ownly menu.
 * When items are added to this category, Ownly will create the category on its live API via POST /api/v1/menu/item.
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
        const name = (body.name || "").trim();
        if (!name) {
            return NextResponse.json(
                { success: false, message: "Category name is required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });

        const newCatId = body.id || `temp_category_${crypto.randomUUID()}`;
        const newSubId = `temp_subcategory_${crypto.randomUUID()}`;

        const newCategory = {
            id: newCatId,
            temp_id: newCatId.startsWith("temp") ? newCatId : "",
            name,
            sortOrder: menuDoc?.menu?.length || 0,
            sub_category: [
                {
                    id: newSubId,
                    temp_id: newSubId,
                    name,
                    items: [],
                },
            ],
        };

        if (menuDoc) {
            if (!Array.isArray(menuDoc.menu)) menuDoc.menu = [];
            menuDoc.menu.push(newCategory);
            await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });
        } else {
            await Menu.create({
                resId: String(resId),
                platform: "ownly",
                menu: [newCategory],
            });
        }

        return NextResponse.json({
            success: true,
            message: "Category created successfully",
            category: newCategory,
        });
    } catch (err) {
        console.error("Ownly Create Category Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to create category" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/menu/[resId]/ownly/category
 * Renames/updates a category in MongoDB
 */
export async function PUT(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const { id, name } = body;

        if (!id || !name?.trim()) {
            return NextResponse.json(
                { success: false, message: "Category ID and new name are required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        const cat = menuDoc.menu.find((c) => String(c.id) === String(id));
        if (!cat) {
            return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
        }

        cat.name = name.trim();
        await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });

        return NextResponse.json({
            success: true,
            message: "Category updated successfully",
            category: cat,
        });
    } catch (err) {
        console.error("Ownly Update Category Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to update category" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/menu/[resId]/ownly/category
 * Deletes a category from MongoDB
 */
export async function DELETE(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const categoryIds = Array.isArray(body.category_ids) ? body.category_ids : [body.id].filter(Boolean);

        if (categoryIds.length === 0) {
            return NextResponse.json(
                { success: false, message: "category_ids array is required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        const idSet = new Set(categoryIds.map(String));
        menuDoc.menu = menuDoc.menu.filter((c) => !idSet.has(String(c.id)));

        await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });

        return NextResponse.json({
            success: true,
            message: "Category deleted successfully",
        });
    } catch (err) {
        console.error("Ownly Delete Category Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to delete category" },
            { status: 500 }
        );
    }
}

