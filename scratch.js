const merge = require('lodash.merge');

const source = {
    item_vo: {
        variant_groups_vo: [
            {
                variant_group: { group_id: 1, name: "Size" },
                variants_vo: [
                    { variant: { id: 10, name: "S", price: 50 } },
                    { variant: { id: 11, name: "L", price: 100 } }
                ]
            }
        ]
    }
};

const allowedUpdates = {
    item_vo: {
        variant_groups_vo: [
            {
                variant_group: { name: "Size" },
                variants_vo: [
                    { variant: { name: "S", price: 0 } },
                    { variant: { name: "L", price: 20 } }
                ]
            }
        ]
    }
};

const payload = merge(source, allowedUpdates);
console.log(JSON.stringify(payload, null, 2));
