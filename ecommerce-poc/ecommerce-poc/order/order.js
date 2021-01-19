const product = require('./product.js');

module.exports = { 
    processOrder: async (order) => {
        const orderInfo = JSON.parse(order);
    
        // go over the product list and get the product info
        const productInfo = await Promise.all(orderInfo.line_items.map(async (item) => {
            let product = await product.getProductById(item.id);
            return formatProduct(product.product, item, orderInfo.discount_codes, orderInfo.customer);;
        }));
    
        // call create transaction data/json
        
        //save the quote
    
        return productInfo;
    }
};


