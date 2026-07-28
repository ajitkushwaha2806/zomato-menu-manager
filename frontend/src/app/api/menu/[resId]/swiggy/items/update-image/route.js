import { NextResponse } from "next/server";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";

export const PUT = async (req, { params }) => {
    try {
        await dbConnect();
        const { resId } = await params;
        const { itemId, imageId, imageUrl, mediaTags } = await req.json();

        if (!itemId || imageUrl === undefined) {
            return NextResponse.json(
                { message: "itemId and imageUrl are required." },
                { status: 400 }
            );
        }

        const menuDoc = await Menu.findOne({ resId: resId, platform: 'swiggy' });
        
        if (!menuDoc) {
            return NextResponse.json(
                { message: "Swiggy menu not found." },
                { status: 404 }
            );
        }

        let itemFound = false;

        // Traverse categories and subcategories to find the item
        for (const cat of menuDoc.menu || []) {
            for (const sub of cat.sub_category || cat.sub_categories || []) {
                const item = (sub.items || []).find(i => String(i.id) === String(itemId));
                if (item) {
                    itemFound = true;
                    if (imageUrl === "") {
                        item.media = [];
                    } else {
                        item.media = [{
                            mediaId: imageId,
                            url: imageUrl,
                            mediaType: "PHOTO",
                            source: "SWIGGY_IMAGE_MIGRATION",
                            ...(mediaTags ? { mediaTags } : {})
                        }];
                    }
                    break;
                }
            }
            if (itemFound) break;
        }

        if (!itemFound) {
            return NextResponse.json(
                { message: "Item not found in menu." },
                { status: 404 }
            );
        }

        // Use updateOne to bypass Mongoose VersionError (__v conflict) caused by concurrent requests
        await Menu.updateOne(
            { _id: menuDoc._id },
            { $set: { menu: menuDoc.menu } }
        );

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error updating image in DB:", error);
        return NextResponse.json(
            { message: "Internal server error." },
            { status: 500 }
        );
    }
};
