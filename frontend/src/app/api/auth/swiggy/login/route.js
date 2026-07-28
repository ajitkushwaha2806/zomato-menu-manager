import { NextResponse } from "next/server";
import { validateRequiredFields } from "@/lib/payload/helper";
import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import SwiggyCredential from "@/model/swiggyCredential";

export async function POST(request) {
    try {
        await dbConnect();

        let body = {};
        try {
            // It might fail if body is empty
            const text = await request.text();
            if (text) {
                body = JSON.parse(text);
            }
        } catch (e) {}

        let username = body.username;
        let password = body.password;
        let accountName = body.accountName;

        // If credentials are not provided in request, fetch from DB
        if (!username || !password) {
            if (!accountName) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Swiggy account name is required to authenticate.",
                    },
                    { status: 400 }
                );
            }
            const creds = await SwiggyCredential.findOne({ name: accountName });
            if (!creds) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Swiggy credentials for '${accountName}' not found in database.`,
                    },
                    { status: 401 }
                );
            }
            username = creds.username;
            password = creds.password;
        }

        const payload = {
            operationName: "loginMutation",
            query: `
                mutation loginMutation($input: LoginRequest!) {
                    login(input: $input) {
                        ID
                        mobile
                        rid
                        name
                        city
                        access_token
                        change_password
                        userType
                        userRole
                        permissions
                        restaurants {
                            rest_id
                            city_name
                            enabled
                            area_name
                            rest_name
                            area_id
                            city_id
                            locality
                            assured
                            rating
                            isDinersOneEnabled
                            isPOS
                            hasMenuAccess
                            display_area_name
                        }
                        user_restaurant_permissions
                    }
                }
            `,
            variables: {
                input: {
                    username: username,
                    password: password,
                    accept_tnc: true,
                    existing_user: true,
                    include_dineout: true,
                    is_otp_login: false,
                    source: "VMS",
                },
            },
        };

        const loginResp = await axios.post(
            `${process.env.NEXT_PUBLIC_SWIGGY_API}/query?mutation=loginMutation`,
            payload,
            {
                headers: {
                    accept: "*/*",
                    "content-type": "application/json",
                    origin: "https://partner.swiggy.com",
                    referer: "https://partner.swiggy.com/",
                    "user-agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
                },
            }
        );

        const loginData = loginResp?.data?.data?.login;

        if (!loginData) {
            throw new Error(
                loginResp?.data?.errors?.[0]?.message ||
                "Login failed"
            );
        }

        console.log("Swiggy Login Success");

        // If login is successful and credentials were provided in the request, save them to DB
        if (body.username && body.password && body.name) {
            const existing = await SwiggyCredential.findOne({ name: body.name });
            if (existing) {
                existing.username = body.username;
                existing.password = body.password;
                await existing.save();
            } else {
                await SwiggyCredential.create({
                    name: body.name,
                    username: body.username,
                    password: body.password,
                });
            }
        }

        return NextResponse.json({
            success: true,
            data: loginData,
        });
    } catch (error) {
        console.error(
            "SWIGGY LOGIN ERROR:",
            error?.response?.status,
            error?.response?.data
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.response?.data?.errors?.[0]?.message ||
                    error?.response?.data?.message ||
                    error?.message,
                data: error?.response?.data,
            },
            {
                status: error?.response?.status || 400,
            }
        );
    }
}