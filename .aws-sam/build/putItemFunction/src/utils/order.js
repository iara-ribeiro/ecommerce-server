var product = require('./product');
//const env = require('../../env.json');
const config = require('config');
const salesforce = require('./salesforce');


/**
 * transactionId - The unique identifier for the transaction. String len 50
 * serviceContractId - The Id of the service contract being amended, leave null for new orders. String len 18.
 * promoCode - The string value (name) of a promo code applied to the order. String len 80
 * currencyIsoCode - Currency code used in the order
 * contactId - The SF contact Id. String len 18
 * accountId - The SF account Id. String len 18
 * lineItems - collection of products
 */
function createTransaction(order, productList) {
    const salesForce = config.get('salesforce');

    return {
        'transactionId': order.id,
        'serviceContractId': null,
        'promoCode': order.discount_codes,
        'currencyIsoCode': order.currency,
        'contactId': salesForce.contactId,
        'accountId': salesForce.accountId,
        'lineItem': productList
    }
}

/**
 * 
 * @param {*} order 
 */
function createQuote(order) {
    //TODO: check if the quote already exists

    //create a new quote
    return {

    };
} 

async function processOrder (order) {
    const orderInfo = JSON.parse(order);
    
    // go over the product list and get the product info
    const productList = await Promise.all(orderInfo.line_items.map(async (item) => {
        let shopifyInfo = await product.getProductById(item.id, item.variant_id);
        let getProductMetafields = await product.getProductMetafields(item.id);

        let productInfo = shopifyInfo[0];
        let variantInfo = shopifyInfo[1];

        return product.formatProduct(productInfo.product, item, orderInfo.discount_codes, orderInfo.customer);
    }));

    const transaction = createTransaction(orderInfo, productList);

    return await salesforce.createQuote(transaction);
};

exports.processOrder = processOrder