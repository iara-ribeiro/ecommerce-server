var order = require('./order/order.js');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */
exports.lambdaHandler = async (event, context) => {
    try {
        //call the function to process the order
        let orderInfo = await order.processOrder(event.body);        
        //let productInfo = await getProductById('4396676022387');
        
        response = {
            'statusCode': 200,
            'body': JSON.stringify(order)
        }
    } catch (err) {
        console.log(err);
        return err;
    }

    return response
};
