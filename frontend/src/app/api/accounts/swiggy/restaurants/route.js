import { SwiggyClient } from "@/lib/api/swiggy-client";
import { NextResponse } from "next/server";

export async function GET(req) {
    try {
        const restaurantResp = await SwiggyClient({
            req,
            endpoint: "/query?query=GetUser",
            method: "POST",
            data: {
                query: `
                  query GetUser($input: GetUserRequest) {
                    get_user(input: $input) {
                      id
                      userRole
                      extendedUserRoles
                      permissions
                      mobile
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
                variables: { input: { include_dineout: true } },
                operationName: "GetUser",
            }
        });

        const rawRestaurants = restaurantResp?.data?.data?.get_user?.restaurants || [];

        const entities = rawRestaurants.map(r => ({
            id: r.rest_id,
            name: r.rest_name,
            subzone: r.area_name ? `${r.area_name}, ${r.city_name}` : r.city_name,
            thumbnail: null,
            hasMenuAccess: r.hasMenuAccess,
            isPOS: r.isPOS,
            raw: r,
        }));

        return NextResponse.json({
            success: true,
            entities: entities,
            data: restaurantResp,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            {
                success: false,
                message: err?.message ?? "Internal Server Error",
            },
            { status: 500 }
        );
    }
}
