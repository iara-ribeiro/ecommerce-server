// 3rd party library to call into a Salesforce org
var jsforce = require('jsforce');
const config = require('config');

const salesForce = config.get('salesforce');
var conn = new jsforce.Connection({ loginUrl: salesForce.loginUrl });

// log in to the org with with a valid username and password using jsforce
async function connectSf() {
    await conn.login(salesForce.username, `${salesForce.password}${salesForce.token}`);
}

/**
 * Get the environmentId
 */
function getEnvironmentId() {
    return null;
}

/** Search if quote already exists in salesforce */
async function checkQuoteExists(transactionId) {
    let result = await conn.sobject('SBQQ__Quote__c')
        .select('*')
        .where(`eComm_Unique_Id__c='${transactionId}'`)
        .limit(1);
    
    return result;
}

/** Get the account info from SF */
async function getAccountInfo() {
    let result = await conn.sobject('Account')
        .select('AASubsidiary__c, GlobalRegion__c')
        .where(`Id='${salesForce.accountId}'`)
        .limit(1);

    return result[0];
}

/** Get the Pricebook id for a bu */
async function getPriceBookId(businessUnit) {
    const year = new Date().getFullYear();
    let result = await conn.sobject("Pricebook2")
        .select('Id, Name')
        .where(`Year__c='${year}' AND Business_Unit__c='${businessUnit}'`)
        .limit(1);

    return result;
}

/** Get the promo code info from SF*/
async function getPromoCode(promoCode) {
    let result = await conn.sobject('SBQQ__DiscountCategory__c')
        .select('Id, Name, Application_Rule__c')
        .where(`Name=${promoCode}`)
        .limit(1);
    
    return result[0];
}

/** Read product info from SF, it return a ProductModel*/
async function readProducts(priceBookId, currencyCode, productId) {
    const args = { pricebookId: priceBookId, currencyCode: currencyCode };
    const body = { context: JSON.stringify(args) };
    const url = `/SBQQ/ServiceRouter?loader=SBQQ.ProductAPI.ProductLoader&uid=${productId}`

    return await conn.apex.patch(url, body);
}

//https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_api.meta/cpq_dev_api/cpq_api_quoteline_model_1.htm
async function createQuoteItem(quote, product, productShopify) {
    let quoteLineInfo = {
        SBQQ__Quote__c: quote.Id,
        SBQQ__Quantity__c: 1,
        SBQQ__Product__c: product.record.PricebookEntries.records[0].Product2Id,
        eComm_Unique_Id__c: quote.eComm_Unique_Id__c,
        SBQQ__EndDate__c: quote.SBQQ__EndDate__c,
        SBQQ__Quantity__c: productShopify.quantity,
        SBQQ__ListPrice__c: productShopify.unitPrice,
        SBQQ__Discount__c: productShopify.totalDiscount,
        NS_ITO_ATTENDEE_EMAIL__c: productShopify.attendeeEmail,
        NS_ITO_ATTENDEE_NAME__c: productShopify.attendeeName,
        NS_ITO_ATTENDEE_PHONE__c: productShopify.attendeePhone,
        Environment__c: productShopify.environmentId,
        Product_Admin__c: null, //productShopify.adminId,
        Selected_Session__c: productShopify.sessionId,
        AVA_SFCPQ__TaxAmount__c: productShopify.taxAmount
    }
    
    console.info('create quote line');
    return await conn.sobject("SBQQ__QuoteLine__c").create([quoteLineInfo]);
}

async function updateQuoteLine(quote, product, productShopify) {
    let quoteLine = await conn.sobject("SBQQ__QuoteLine__c")
        .select('*')
        .where(`SBQQ__Quote__c='${quote.Id}' and SBQQ__Product__c='${product.record.PricebookEntries.records[0].Product2Id}'`);

    console.info(`update quote line for ${quote.Id}, ${product.record.PricebookEntries.records[0].Product2Id}`);
    let newQuoteLineInfo = {
        eComm_Unique_Id__c: quote.eComm_Unique_Id__c,
        SBQQ__EndDate__c: quote.SBQQ__EndDate__c,
        SBQQ__Quantity__c: productShopify.quantity,
        SBQQ__ListPrice__c: productShopify.unitPrice,
        SBQQ__Discount__c: productShopify.totalDiscount,
        NS_ITO_ATTENDEE_EMAIL__c: productShopify.attendeeEmail,
        NS_ITO_ATTENDEE_NAME__c: productShopify.attendeeName,
        NS_ITO_ATTENDEE_PHONE__c: productShopify.attendeePhone,
        Environment__c: productShopify.environmentId,
        Product_Admin__c: productShopify.adminId,
        Selected_Session__c: productShopify.sessionId,
        AVA_SFCPQ__TaxAmount__c: productShopify.taxAmount,
        AVA_SFCPQ__SalesTaxDetails__c: productShopify.taxDetails
    };

    let updatedQuote = await conn.sobject("SBQQ__QuoteLine__c")
        .find({ Id : quoteLine[0].Id })
        .update(newQuoteLineInfo);
    
    return updatedQuote;
}

/** Map the products from shopify to the quote line
 * https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_api.meta/cpq_dev_api/cpq_api_product_model_8.htm
 */
async function addQuoteProducts(lineItems, quote) {
    console.info(`start adding the products to quote - ${quote.Id}`);
    let result;

    if (lineItems.length > 0) {
        result = await Promise.all(lineItems.map( async (item) => {
            let product = JSON.parse(await readProducts('01s2M000008d5y8QAA', quote.CurrencyIsoCode, item.productId));
            let lineItem = createQuoteItem(quote, product, item);
            //let lineItem = updateQuoteLine(quote, product, item);
            return lineItem;
         }));     
    }

    return result;
}

/** Calculates the prices of a CPQ quote created at SF */
async function calculateQuote(quote) {
    //var body = {context: JSON.stringify(args.context)};
    console.info(`calculate the quote - ${quote[0].Id}`);

    const body = { context: JSON.stringify({ quote: { record: quote[0] } })};
    const url = '/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteCalculator'

    return await conn.apex.patch(url, body);
}

/** Validate a CPQ quote and return any validation errors. */
async function validateQuote(quote) {
     //var body = {context: JSON.stringify(args.context)};
    console.info(`Validate the quote - ${quote.Id}`);

    const body = { context: JSON.stringify({ quote: { record: quote } })};
    const url = '/SBQQ/ServiceRouter?loader=QuoteAPI.QuoteValidator';
    
    return await conn.apex.patch(url, body);
}

/** Save Quote API saves a CPQ quote. */
async function saveQuote(quote) {
    //{saver: "SBQQ.QuoteAPI.QuoteSaver", model: {record: quote}
    const body = { saver: "SBQQ.QuoteAPI.QuoteSaver", model: JSON.stringify({ record: quote[0] })};
    const url = '/SBQQ/ServiceRouter';

    return await conn.apex.post(url, body);
}

/**
 * Create a quote in Salesforce.
 */
async function createQuote(transaction) {
    try {
        await connectSf();

        const businessUnit = 'XBU';
        let quoteSF = await checkQuoteExists(transaction.transactionId);
        let quote;

        console.info(`Quote exists - ${quoteSF.length}`);

        if (quoteSF.length === 0) {
            let accountInfo = await getAccountInfo();
            let promoCode = null;

            let priceBook = await getPriceBookId(businessUnit);

            if (transaction.promoCode.length > 0) {
                promoCode = await getPromoCode(transaction.promoCode);
            }

            // Fix the issues with the account and add ApprovalStatus__c: 'Approved',
            let quoteInfo = { 
                eComm_Unique_Id__c: transaction.transactionId,
                SBQQ__Account__c: salesForce.accountId,
                SBQQ__PrimaryContact__c: salesForce.contactId,
                Business_Unit__c: businessUnit,
                Subsidiary__c: accountInfo.AASubsidiary__c,
                Global_Region__c: accountInfo.GlobalRegion__c,
                Calculate_Taxes_on_Quote__c: false,
                CurrencyIsoCode: transaction.currencyIsoCode,
                SBQQ__Primary__c: true,
                SBQQ__StartDate__c: new Date(),
                SBQQ__SubscriptionTerm__c: 12,
                SBQQ__Status__c: 'Approved',
                Approval_Notes__c: 'This is an e-comm purchase and does not require approval notes.',
                AA_Quote_Doc_Generated__c: true,
                SBQQ__BillingFrequency__c: 'Annual',
                Approval_Type__c: 'e-mail / Attach',
                ApprovalStatus__c: 'Approved',
                SBQQ__PaymentTerms__c: 'Due on receipt',
                SBQQ__PriceBook__c: "01s2M000008d5y8QAA",
                SBQQ__PriceBookId__c: "01s2M000008d5y8QAA",
                Ship_to_Contact__c: salesForce.contactId,
                Bill_to_Contact__c: salesForce.contactId,
                Promo_Code__c: promoCode
            };

            //first create the quote then add the products to avoid mixed dml errors
            await conn.sobject("SBQQ__Quote__c").create([quoteInfo]);

            //get all the quote info after creating it at SF
            quoteSF = await checkQuoteExists(transaction.transactionId);
        } else {
            if (quoteSF.SBQQ__Ordered__c == true) {
                return ({'status': 'The quote is already resolved. Aborting process.'});
            }

            /*if(quoteSF.SBQQ__LineItems__r.size() > 0) {
                return ({'status': 'Existing line items found. Aborting process.'});
            }*/
        }

        let lineItems = await addQuoteProducts(transaction.lineItems, quoteSF[0]);

        return lineItems;
        //return quoteSF;
        /*console.info(lineItems);

        let updatedQuote = await conn.sobject('SBQQ__Quote__c').update(
            { 
                Id : quoteSF[0].Id,
                lineItems : lineItems
            }
        );

        return updatedQuote;*/
        //let quoteModel = JSON.parse(await calculateQuote(quoteSF[0]));
        //return await validateQuote(quoteModel.record);

        //return saveQuote(quoteSF[0]);
        
    } catch (err) {
        console.info(err);
        throw (err);
    }
}

exports.getEnvironmentId = getEnvironmentId;
exports.createQuote = createQuote;
