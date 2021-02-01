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

    let result;
    const groupKey = 0;
    const ignoreCalculate = true;
    const url = '/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteProductAdder';

    if (lineItems.length > 0) {
        result = await Promise.all(lineItems.map( async (item) => {
            let product = JSON.parse(await readProducts('01s2M000008d5y8QAA', quote.CurrencyIsoCode, item.productId));
            
            //Pass the product to the product model format
            /* Id configuredProductId; 
               Id optionId; 
               SBQQ__ProductOption__c optionData; // Editable data about the option in question, such as quantity or discount 
               SBQQ__ProductOption__c configurationData; 
               SBQQ__ProductOption__c inheritedConfigurationData; 
               ConfigurationModel[] optionConfigurations; 
               Boolean configured; 
               Boolean changedByProductActions; 
               Boolean isDynamicOption; 
               Boolean isUpgrade; 
               Set<Id> disabledOptionIds; 
               Set<Id> hiddenOptionIds; 
               Decimal listPrice; 
               Boolean priceEditable; 
               String[] validationMessages; 
               String dynamicOptionKey; */
            
            /*let productConfiguration = {
                configuredProductId: produc.Id,
                optionId: item.Id,
                configured: false,
                changedByProductActions: false,
                isDynamicOption: true,
                isUpgrade: false,
                priceEditable: false
            };*/
            
            /*Product2 record;
              Id upgradedAssetId;
              String currencySymbol;
              String currencyCode;
              String[] featureCategories;
              OptionModel[] options;
              FeatureModel[] features;
              ConfigurationModel configuration;
              ConfigAttributeModel[] configurationAttributes;
              ConfigAttributeModel[] inheritedConfigurationAttributes;
              ConstraintModel[] constraints; 
            */

            /*let productModel = {
                record: product.record,
                currencySymbol: product.currencySymbol,
                currencyCode: product.currencyCode,
                featureCategories: product.featureCategories,
                options: product.options,
                features: product.features,
                //configuration: productConfiguration,
                configurationAttributes: product.configurationAttributes,
                inheritedConfigurationAttributes: [],
                constraints: product.constraints
            }

            //console.info(productModel);
            console.info(product);*/
            return product;

         }));     
    }

    //var context = { quote: quote, groupKey: groupKey, products: products, ignoreCalculate: ignoreCalculate };
    const args = { quote: { record:  quote }, products: result, groupKey: groupKey, ignoreCalculate: ignoreCalculate };
    const body = { "context": JSON.stringify(args) };

    return await conn.apex.patch(url, body);
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
                SBQQ__PriceBook__c: priceBook.Id,
                SBQQ__PriceBookId__c: priceBook.Id,
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

        return await addQuoteProducts(transaction.lineItems, quoteSF[0]);

        /*let quoteModel = JSON.parse(await calculateQuote(quoteSF));

        return await validateQuote(quoteModel.record);

        //return saveQuote(quoteSF);
        */
    } catch (err) {
        console.info(err);
        throw (err);
    }
}

exports.getEnvironmentId = getEnvironmentId;
exports.createQuote = createQuote;
