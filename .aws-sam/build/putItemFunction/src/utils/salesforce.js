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


/** Map the products from shopify to the quote line
 * https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_api.meta/cpq_dev_api/cpq_api_product_model_8.htm
 */
async function addQuoteProducts(lineItems, quote) {
    console.info(`start adding the products to quote - ${quote.Id}`);
    let productList = [];

    if (lineItems.length > 0) {
        await Promise.all(lineItems.map( async (item) => {
            console.info(`reading product - ${item.productId}`);
            let product = JSON.parse(await readProducts(quote.SBQQ__PriceBookId__c, quote.CurrencyIsoCode, item.productId));
            productList.push(product);

            return product;
         }));     
    }

    let quoteModel = await conn.apex.get(`/SBQQ/ServiceRouter?reader=SBQQ.QuoteAPI.QuoteReader&uid=${quote.Id}`);

    let quoteWithProduct = await conn.apex.patch('/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteProductAdder', {
        context: JSON.stringify({
            quote: JSON.parse(quoteModel),
            products: productList,
            groupKey: 0,
            ignoreCalculate: true
        })
    });
    
    console.info('adding transaction attributes');
    quoteWithProduct = JSON.parse(quoteWithProduct);
    
    quoteWithProduct.lineItems.forEach((item, index) => {
        productOrder = lineItems[index];

        item.record.eComm_Unique_Id__c = productOrder.transactionId;
        item.record.SBQQ__StartDate__c = productOrder.startDate;
        item.record.SBQQ__EndDate__c = productOrder.endDate;
        item.record.SBQQ__Quantity__c = productOrder.quantity;
        item.record.SBQQ__ListPrice__c = productOrder.unitPrice;
        item.record.SBQQ__Discount__c = productOrder.totalDiscount === "0.00" ? null : productOrder.totalDiscount;
        item.record.NS_ITO_ATTENDEE_EMAIL__c = productOrder.attendeeEmail;
        item.record.NS_ITO_ATTENDEE_NAME__c = productOrder.attendeeName;
        item.record.NS_ITO_ATTENDEE_PHONE__c = productOrder.attendeePhone;
        item.record.Environment__c = productOrder.environmentId;
        //item.record.Product_Admin__c = "0010n00001BnQ4F";
        item.record.Selected_Session__c = productOrder.sessionId;
        item.record.AVA_SFCPQ__TaxAmount__c = productOrder.taxAmount;
        item.record.AVA_SFCPQ__SalesTaxDetails__c = (productOrder.taxDetails).toString();
    });

    return quoteWithProduct;
}

/** Validate a CPQ quote and return any validation errors. */
async function validateQuote(quote) {
    //console.info(`Validate the quote - ${JSON.parse(quote).Id}`);
    const url = '/SBQQ/ServiceRouter?loader=QuoteAPI.QuoteValidator';
    
    return await conn.apex.patch(url, {
        context: JSON.stringify(quote)
    });
}

/**
 * Create a quote in Salesforce.
 */
async function createQuote(transaction) {
    try {
        await connectSf();
        const businessUnit = 'XBU';

        let priceBook = await getPriceBookId(businessUnit);

        let quoteSF = await checkQuoteExists(transaction.transactionId);

        console.info(`Quote exists - ${quoteSF.length}`);

        if (quoteSF.length === 0) {
            let accountInfo = await getAccountInfo();
            let promoCode = null;

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
                ApprovalStatus__c: 'Approved',
                Approval_Notes__c: 'This is an e-comm purchase and does not require approval notes.',
                AA_Quote_Doc_Generated__c: true,
                SBQQ__BillingFrequency__c: 'Annual',
                Approval_Type__c: 'e-mail / Attach',
                SBQQ__PaymentTerms__c: 'Due on receipt',
                SBQQ__PriceBook__c: priceBook[0].Id,
                SBQQ__PriceBookId__c: priceBook[0].Id,
                Ship_to_Contact__c: salesForce.contactId,
                Bill_to_Contact__c: salesForce.contactId,
                Promo_Code__c: promoCode
            };

            //first create the quote then add the products to avoid mixed dml errors
            await conn.sobject("SBQQ__Quote__c").create([quoteInfo]);
            quoteSF = await checkQuoteExists(transaction.transactionId);
            
        } else {
            if (quoteSF[0].SBQQ__Ordered__c == true) {
                return ({'status': 'The quote is already resolved. Aborting process.'});
            }

            if(quoteSF[0].SBQQ__LineItemCount__c > 0) {
                return ({'status': 'Existing line items found. Aborting process.'});
            }
        }

        console.info('add the products to the quote');
        let quoteWithProduct = await addQuoteProducts(transaction.lineItems, quoteSF[0]);

        console.info('calculating the quote');
        let calculatedQuote = await conn.apex.patch('/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteCalculator', {
            context: JSON.stringify({
                quote: quoteWithProduct
            })
        });

        console.info('checking the quote for validation errors');
        let validationErrors = JSON.parse(await validateQuote(quoteWithProduct));

        if (validationErrors.length > 0) {
            return ({'status': validationErrors});
        }

        console.info('saving the quote');
        return await conn.apex.post('/SBQQ/ServiceRouter', {
            saver: 'SBQQ.QuoteAPI.QuoteSaver',
            model: calculatedQuote
        });
    } catch (err) {
        console.info(err);
        throw (err);
    }
}

exports.getEnvironmentId = getEnvironmentId;
exports.createQuote = createQuote;
