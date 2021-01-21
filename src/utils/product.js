const axios = require('axios');
const config = require('config');
const sf = require ('../utils/salesforce');

/**
 * @param 
 * productId - SF Product Id
 * quantity - The quantity sold for this product
 * unitPrice - The unit price presented to the client for this line item
 * totalDiscount - The total discount applied to this line item (percentage)
 * taxAmount - The amount of tax charged for this product
 * taxDetails - The tax details on the line item (6% VAT etc)
 * startDate - If you need to specify the start-date for a line item define that here
 * endDate - If you need to specify the end-date for a line item define that here
 * promoCode - Boolean, if this is a 'select-one' promo code flag that here
 * transactionId - Unique transaction identifier for this line item
 * attendeeEmail: Email Address for the person taking the class
 * attendeeName - Name of the person attending the class
 * attendeePhone - Phone number for the person taking the class
 * sessionId - The SF Class Id that the client is attending
 * environmentId - SF Id for the environment associated to this line item
 * adminId: SF contact Id for the product admin
 * options - collection of product objects, Variant/child options. Can be blank, if not it would equate to the variant.
 * 
 * @param {*} productOrder 
 * @param {*} discountCodes 
 * @param {*} customer 
 */
function formatProduct (productShopify, productOrder, discountCodes, customer) {
    const salesForce = config.get('salesforce');

    let totalTax = 0;
    let taxDetails = [];
    let attendeeEmail = productOrder.properties.filter(item => item.name = 'NS_ITO_ATTENDEE_EMAIL__c__0');
    let attendeeName = productOrder.properties.filter(item => item.name = 'NS_ITO_ATTENDEE_NAME__c__0');
    let attendeePhone = productOrder.properties.filter(item => item.name = 'NS_ITO_ATTENDEE_PHONE__c__0');

    productOrder.tax_lines.map(item => {
        totalTax = totalTax + parseFloat(item.price);
        taxDetails.push(item.title);
    });

    let environmentId = sf.getEnvironmentId();
    
    return {
        'productId': null,
        'quantity': productOrder.quantity,
        'unitPrice': productOrder.price,
        'totalDiscount': productOrder.total_discount,
        'taxAmount': totalTax,
        'taxDetails': taxDetails,
        'startDate': null,
        'endDate': null,
        'promoCode': discountCodes.length > 0,
        'transactionId': productOrder.id,
        'attendeeEmail': attendeeEmail,
        'attendeeName': attendeeName,
        'attendeePhone': attendeePhone,
        'sessionId': null,
        'environmentId': environmentId, 
        'adminId': salesForce.accountId,
        'options': productShopify.variants
    };
}

/**
 * Get product by id from Shopify API
 * @param {string} productID 
 */
async function getProductById (productID, variantID) {
    try {
        const shopifyConfig = config.get('shopify');
        const apikey = shopifyConfig.apiKey; //env.shopify.apiKey;
        const password = shopifyConfig.password; //env.shopify.password;
        const hostname = shopifyConfig.hostname; //env.shopify.hostname;

        //const productUrl = `https://${apikey}:${password}@${hostname}/admin/api/2021-01/products/${productID}.json`;

        const variantURL = `https://${apikey}:${password}@${hostname}/admin/api/2021-01/variants/${variantID}.json`;

        let result = await axios.get(variantURL);

        if (result.status === 200) {
            return result.data;
        } else {
            throw (`error trying to retrieve product information ${productID}`);
        }
    } catch (err) {
        return err;
    }
}

/**
 * Get product by id from Shopify API
 * @param {string} productID 
 */
async function getProductMetafields (productID) {
    try {
        const shopifyConfig = config.get('shopify');
        const apikey = shopifyConfig.apiKey; //env.shopify.apiKey;
        const password = shopifyConfig.password; //env.shopify.password;
        const hostname = shopifyConfig.hostname; //env.shopify.hostname;

        const url = `https://${apikey}:${password}@${hostname}/admin/api/2021-01/products/${productID}/metafields.json`;

        let result = await axios.get(url);

        if (result.status === 200) {
            return result.data;
        } else {
            throw (`error trying to retrieve product information ${productID}`);
        }
    } catch (err) {
        return err;
    }
}

exports.formatProduct = formatProduct;
exports.getProductById = getProductById;
exports.getProductMetafields = getProductMetafields;

