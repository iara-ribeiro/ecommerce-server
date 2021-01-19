const axios = require('axios');

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
const formatProduct = (productShopify, productOrder, discountCodes, customer) => {
    let totalTax = 0;
    let taxDetails = [];

    productOrder.tax_lines.map(item => {
        totalTax = totalTax + parseFloat(item.price);
        taxDetails.push(item.title);
    })
    
    return {
        'productId': productShopify.id,
        'quantity': productOrder.quantity,
        'unitPrice': productOrder.price,
        'totalDiscount': productOrder.total_discount,
        'taxAmount': totalTax,
        'taxDetails': taxDetails,
        'startDate': null,
        'endDate': null,
        'promoCode': discountCodes.length > 0,
        'transactionId': null,
        'attendeeEmail': customer.email,
        'attendeeName': `${customer.first_name} ${customer.last_name}`,
        'attendeePhone': customer.phone,
        'sessionId': null,
        'environmentId': null,
        'adminId': null,
        'options': productShopify.variants
    };
}

/**
 * Get product by id from Shopify API
 * @param {string} productID 
 */
const getProductById = async (productID) => {
    try {
        const apikey = "61e4d1f3dbf567c97f8704a9ee0f426e";
        const password = "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";
        const hostname = 'altus-test.myshopify.com';

        const url = `https://${apikey}:${password}@${hostname}/admin/api/2021-01/products/${productID}.json`;
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
