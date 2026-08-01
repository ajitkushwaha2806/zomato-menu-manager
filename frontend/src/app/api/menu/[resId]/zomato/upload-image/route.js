import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";

export async function POST(req, { params }) {
    try {
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        const formData = await req.formData();
        let file = formData.get("file");
        const providedImageUrl = formData.get("imageUrl");

        if (!file && !providedImageUrl) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Image file or URL is required",
                },
                { status: 400 }
            );
        }

        if (file) {
            console.log("📥 Received file from frontend:", { name: file.name, type: file.type, size: file.size });
            const supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];
            if (file.type && !supportedTypes.includes(file.type.toLowerCase())) {
                return NextResponse.json(
                    {
                        success: false,
                        upload_status: "rejected",
                        message: `Unsupported file format: ${file.type}. Please use JPEG, PNG, WEBP, or AVIF.`,
                    },
                    { status: 400 }
                );
            }
        }

        if (!file && providedImageUrl) {
            try {
                let urlToFetch = providedImageUrl;
                
                // Handle Google Image Search redirect URLs
                try {
                    const parsedUrl = new URL(providedImageUrl);
                    if (parsedUrl.hostname.includes("google.") && parsedUrl.pathname === "/imgres") {
                        const imgurl = parsedUrl.searchParams.get("imgurl");
                        if (imgurl) {
                            // URL may or may not be already decoded by URL API
                            urlToFetch = imgurl.startsWith("http") ? imgurl : decodeURIComponent(imgurl);
                        }
                    }
                } catch(e) {}

                // Fetch on the server to completely bypass CORS
                const imageRes = await fetch(urlToFetch, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    }
                });
                if (!imageRes.ok) {
                    throw new Error(`Failed to fetch image from external source. Status: ${imageRes.status}`);
                }

                const contentTypeRaw = imageRes.headers.get("content-type") || "image/jpeg";
                const contentType = contentTypeRaw.split(';')[0].trim().toLowerCase();
                
                const supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];
                if (!supportedTypes.includes(contentType) && !contentType.startsWith("image/")) {
                    throw new Error(`Unsupported fetched format: ${contentType}. Please use a direct link to a valid image.`);
                }

                let ext = "jpg";
                if (contentType.includes("png")) ext = "png";
                else if (contentType.includes("webp")) ext = "webp";
                else if (contentType.includes("avif")) ext = "avif";
                
                const arrayBuffer = await imageRes.arrayBuffer();
                file = new Blob([arrayBuffer], { type: contentType });
                file.name = `upload-image.${ext}`;
            } catch (err) {
                return NextResponse.json(
                    { success: false, message: err.message || "Failed to download image from the provided URL" },
                    { status: 400 }
                );
            }
        }

        // Convert AVIF/WEBP to JPEG using Sharp
        try {
            const type = file.type || "";
            if (type.includes("avif") || type.includes("webp") || file.name.endsWith(".avif") || file.name.endsWith(".webp")) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                let jpegBuffer;
                
                try {
                    const sharp = require('sharp');
                    jpegBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
                } catch (sharpErr) {
                    console.error("Failed to load sharp (likely ABI mismatch in Electron), sending WebP directly:", sharpErr.message);
                    // Fallback to sending original buffer if sharp fails
                    jpegBuffer = buffer;
                }
                
                file = new Blob([jpegBuffer], { type: "image/jpeg" }); // We say it's jpeg even if it's webp to trick the backend if needed, or Zomato might accept WebP natively
                file.name = "converted.jpg";
            }
        } catch (convertErr) {
            console.error("Image format conversion error:", convertErr);
        }

        // Construct robust FormData for Axios in Node.js
        const FormDataNode = require('form-data');
        const uploadForm = new FormDataNode();
        uploadForm.append("res_id", resId);
        uploadForm.append("is_addon_item", "0");
        uploadForm.append("is_charge_item", "0");
        
        // Convert Blob to Buffer for form-data
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        uploadForm.append("data_file", buffer, { 
            filename: file.name || "upload.jpg", 
            contentType: file.type || "image/jpeg" 
        });

        const result = await apiClient({
            req,
            endpoint: "/php/online_ordering/menu_edit",
            method: "POST",
            params: {
                action: "upload_image",
                service_role: "DELIVERY_TAKEAWAY",
                page_key: "menu",
            },
            data: uploadForm,
            headers: uploadForm.getHeaders(),
        });

        if (!result?.success) {
            console.error("❌ ZOMATO UPLOAD REJECTED OR FAILED:", {
                message: result?.message,
                status: result?.status,
                url: providedImageUrl || "file upload"
            });
            return NextResponse.json(
                {
                    success: false,
                    upload_status: "rejected",
                    message: result?.message || "Upload failed",
                },
                { status: result?.status || 500 }
            );
        }

        const data = result?.data?.data || result?.data;
        console.log("data", data)


        const isRejected = data?.image_stock_info?.isStock === true;

        if (isRejected) {
            return NextResponse.json(
                {
                    success: false,
                    upload_status: "rejected",
                    message: "Image rejected by system, kindly reupload",
                    data,
                },
                { status: 200 }
            );
        }

        const imageUrl =
            data?.image_url ||
            data?.url ||
            null;

        return NextResponse.json(
            {
                success: true,
                upload_status: "approved",
                message: "Image uploaded successfully",
                imageUrl,
                data,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("🔥 UPLOAD_ERROR CATCH BLOCK:", {
            message: err?.message,
            responseData: err?.response?.data,
            status: err?.response?.status,
        });

        return NextResponse.json(
            {
                success: false,
                upload_status: "rejected",
                message:
                    err?.response?.data?.message ||
                    err?.message ||
                    "Internal Server Error",
            },
            {
                status: err?.response?.status || 500,
            }
        );
    }
}