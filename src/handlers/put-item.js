var order = require('../utils/order');
const crypto = require('crypto'); 
const config = require('config');

function verifySignature(header, buf) {
    const hmac = header["X-Shopify-Hmac-Sha256"];

    if (!hmac || header['x-kotn-webhook-verified']) {
        return false;
    }

    var sharedSecret = config.get('shopify').secret;
    var digest = crypto.createHmac('SHA256', sharedSecret).update(buf).digest('base64');
    return digest === hmac;
}

/**
 * A simple example includes a HTTP post method to add one item to a DynamoDB table.
 */
exports.putItemHandler = async (event) => {
    if (event.httpMethod !== 'POST') {
        throw new Error(`postMethod only accepts POST method, you tried: ${event.httpMethod} method.`);
    }

    /*if (!verifySignature(event.headers, event.body)) {
        throw new Error('Request not authorized');
    }*/

    // All log statements are written to CloudWatch
    console.info('received');
    console.info(event.body);

    const quote = await order.processOrder(event.body);
    
    const response = {
        statusCode: 200,
        body: JSON.stringify(quote)
    };

    // All log statements are written to CloudWatch
    //console.info(`response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`);
    return response;
}
