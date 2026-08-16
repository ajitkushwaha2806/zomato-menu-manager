import("dotenv/config").then(() => {
    import("./src/lib/dbConnect.js").then(async ({ default: dbConnect }) => {
        await dbConnect();
        const { petpoojaClient } = await import("./src/lib/api/petpooja-client.js");
        
        try {
            // First try GET
            const result = await petpoojaClient({
                accountName: "test", // Assuming a valid account isn't here, it will fail
                endpoint: "/menus/menu_item_list_new/all",
                method: "GET"
            });
            console.log(result.substring(0, 500));
        } catch (err) {
            console.error(err.message);
        }
        process.exit(0);
    });
});
