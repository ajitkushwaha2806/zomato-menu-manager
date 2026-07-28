import path from "path";
import axios from "axios";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";

function generateImagePath(imageName, detectedExt = "jpg") {
    const fileName = path.parse(imageName).name;

    const sanitizedName = `${fileName}.${detectedExt}`
        .replace(/[<>:"/\\|?*]/g, "")
        .trim();

    return `web-sdk/food/${randomUUID()}/${sanitizedName}`;
}

export async function POST(request) {
    try {
        const incomingForm = await request.formData();

        let image = incomingForm.get("image");
        const imageUrl = incomingForm.get("imageUrl");
        const itemName = incomingForm.get("itemName");

        if (!image && !imageUrl) {
            return NextResponse.json(
                {
                    success: false,
                    message: "image or imageUrl is required",
                },
                { status: 400 }
            );
        }

        if (!itemName) {
            return NextResponse.json(
                {
                    success: false,
                    message: "itemName is required",
                },
                { status: 400 }
            );
        }

        let imageBuffer;
        let imageType = "image/jpeg";
        let imageNameStr = `${itemName}.jpg`;

        if (image) {
            imageBuffer = Buffer.from(await image.arrayBuffer());
            imageType = image.type || "image/jpeg";
            imageNameStr = image.name || imageNameStr;
        } else if (imageUrl) {
            try {
                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                imageBuffer = Buffer.from(imgResponse.data);
                imageType = imgResponse.headers['content-type'] || "image/jpeg";
                imageNameStr = imageUrl.split('/').pop().split('?')[0] || imageNameStr;
            } catch (err) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Failed to download image from provided URL",
                    },
                    { status: 400 }
                );
            }
        }

        const detectedType =
            await fileTypeFromBuffer(
                imageBuffer
            );

        const imagePath = generateImagePath(
            imageNameStr,
            detectedType?.ext || "jpg"
        );
        console.log(imageNameStr, imageType, imagePath, detectedType)
        /**
         * STEP 1
         * Get presigned upload URL
         */
        const uploadForm = new FormData();

        uploadForm.append("image_name", imagePath);
        uploadForm.append("project_details", "true");
        uploadForm.append(
            "prod_cat_id",
            process.env.PRODUCT_CAT_ID
        );
        uploadForm.append("source", "web_sdk");
        uploadForm.append("project_name", "Swiggy");
        uploadForm.append("sku_name", itemName);

        const { data: uploadResponse } =
            await axios.put(
                `${process.env.NEXT_PUBLIC_SWIGGY_CLIPPER_API}/api/fv1/upload/image`,
                uploadForm,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.SWIGGY_CLIPPER_API_TOKEN}`,
                        Origin:
                            "https://partner.swiggy.com",
                        Referer:
                            "https://partner.swiggy.com/",
                    },
                }
            );

        const {
            presigned_url,
            file_url,
            project_id,
            sku_id,
            request_id,
        } = uploadResponse.data;

        /**
         * STEP 2
         * Upload binary to S3
         */
        const buffer = imageBuffer;

        await axios.put(
            presigned_url,
            buffer,
            {
                headers: {
                    "Content-Type":
                        imageType,

                    "Content-Length":
                        buffer.length,

                    Origin:
                        "https://partner.swiggy.com",

                    Referer:
                        "https://partner.swiggy.com/",
                },

                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }
        );

        /**
         * STEP 3
         * Angle Classifier
         */
        const angleForm = new FormData();

        angleForm.append(
            "image_url",
            file_url
        );

        angleForm.append(
            "prod_cat_id",
            process.env.PRODUCT_CAT_ID
        );

        angleForm.append(
            "project_id",
            project_id
        );

        angleForm.append(
            "sku_id",
            sku_id
        );

        const { data: angleResponse } =
            await axios.post(
                `${process.env.NEXT_PUBLIC_SWIGGY_CLIPPER_API}/api/fv2/image/angle-classifier`,
                angleForm,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.SWIGGY_CLIPPER_API_TOKEN}`,
                        Origin:
                            "https://partner.swiggy.com",
                        Referer:
                            "https://partner.swiggy.com/",
                    },
                }
            );

        const classificationStatus =
            angleResponse?.data
                ?.classification_status;

        if (classificationStatus !== "passed") {
            console.log("Swiggy Angle Classifier Rejected:", angleResponse?.data);
            return NextResponse.json(
                {
                    success: false,
                    message: "Swiggy AI Angle Classifier rejected this image.",
                    stage: "angle-classifier",
                    classification: angleResponse?.data,
                },
                {
                    status: 400,
                }
            );
        }

        const {
            category,
            sub_category,
            angle,
        } =
            angleResponse.data
                .classification_result;

        /**
         * STEP 4
         * Stable Diffusion
         */
        const sessionId =
            `web_food_${randomUUID()}`;

        const {
            data: stableDiffusionResponse,
        } = await axios.post(
            `${process.env.NEXT_PUBLIC_SWIGGY_CLIPPER_API}/api/nv2/app/stable-diffusion`,
            {
                prod_cat_id:
                    process.env.PRODUCT_CAT_ID,

                image_url:
                    file_url,

                source:
                    "web_sdk",

                image_name:
                    imagePath,

                angle,

                prod_sub_cat_id:
                    sub_category,

                image_category:
                    category,

                sku_id,

                prompt_id:
                    process.env.CLIPPER_PROMPT_ID ||
                    "prompt_12335",

                project_id,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.SWIGGY_CLIPPER_API_TOKEN}`,

                    enterprise_id:
                        process.env.CLIPPER_ENTERPRISE_ID,

                    sdk_version:
                        "1.0.5-beta",

                    session_id:
                        sessionId,

                    Origin:
                        "https://partner.swiggy.com",

                    Referer:
                        "https://partner.swiggy.com/",
                },
            }
        );

        /**
         * DEBUG
         */
        console.log(
            "Stable Diffusion Response:",
            JSON.stringify(
                stableDiffusionResponse,
                null,
                2
            )
        );

        const imageId = stableDiffusionResponse?.data?.image_id;

        if (!imageId) {
            return NextResponse.json(
                {
                    success: false,
                    stage:
                        "stable-diffusion",
                    message:
                        "No image_list returned from stable-diffusion",

                    stableDiffusionResponse,
                },
                {
                    status: 400,
                }
            );
        }

        const {
            data: markDoneResponse,
        } = await axios.put(
            `${process.env.NEXT_PUBLIC_SWIGGY_CLIPPER_API}/api/fv1/process/mark-done`,
            {
                sku_id,
                project_id,
                image_list:
                    [imageId],
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.SWIGGY_CLIPPER_API_TOKEN}`,
                    "Content-Type":
                        "application/json",
                    Origin:
                        "https://partner.swiggy.com",
                    Referer:
                        "https://partner.swiggy.com/",
                },
            }
        );

        return NextResponse.json({
            success: true,
            imagePath,
            file_url,
            project_id,
            sku_id,
            request_id,
            upload:
                uploadResponse,
            classification:
                angleResponse,
            stableDiffusion:
                stableDiffusionResponse,
            markDone:
                markDoneResponse,
        });
    } catch (error) {
        console.error(
            "CLIPPR ERROR:",
            error?.response?.data ||
            error
        );

        return NextResponse.json(
            {
                success: false,

                message:
                    error?.response?.data
                        ?.message ||
                    error?.message ||
                    "Something went wrong",

                error:
                    error?.response?.data,
            },
            {
                status:
                    error?.response
                        ?.status || 500,
            }
        );
    }
}