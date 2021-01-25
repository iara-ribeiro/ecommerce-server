// 3rd party library to call into a Salesforce org
var jsforce = require('jsforce');
const config = require('config');

const salesForce = config.get('salesforce');
var conn = new jsforce.Connection({ loginUrl: salesForce.loginUrl });

// log in to the org with with a valid username and password using jsforce
async function connectSf() {
    await conn.login(salesForce.username, `${salesForce.password}${salesForce.token}`);
}

/** Retrieve the product info from SF */
async function getProduct(productId, pricebookId, currencyCode) {
    var product = await conn.apex.patch('/SBQQ/ServiceRouter?loader=SBQQ.ProductAPI.ProductLoader&uid=' + productId, {        
        context: JSON.stringify({            
            pricebookId: pricebookId,
            currencyCode: currencyCode        
        })    
    });

    return product;
}

async function addProductToQuote(quoteModel, productModel) {
    var updatedQuote = await conn.apex.patch('/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteProductAdder', {
        context: JSON.stringify({
            quote: quoteModel,
            products: [productModel],
            groupKey: 0,
            ignoreCalculate: true
        })
    });

    return updatedQuote;
}

async function calculateQuote(quoteWithProduct) {
    var quote = JSON.parse(quoteWithProduct);
    // cacluate the quote with the added product
    var calculatedQuote = await conn.apex.patch('/SBQQ/ServiceRouter?loader=SBQQ.QuoteAPI.QuoteCalculator', {
        context: JSON.stringify({
            quote: quote
        })
    });

    return calculateQuote;
}

async function saveQuote(calculatedQuote) {
    var quote = JSON.parse(calculatedQuote);
    // save the calucated quote
    var savedQuote = await conn.apex.post('/SBQQ/ServiceRouter', {
        saver: 'SBQQ.QuoteAPI.QuoteSaver',
        model: JSON.stringify(quote)
    });

    return savedQuote;
}

/**
 * Get the environmentId
 */
function getEnvironmentId() {
    return null;
}

function getProductId() {
    return null;
}

/** Search if quote already exists in salesforce */
async function checkQuoteExists(transactionId) {
    console.info(transactionId);
    
    let result = await conn.sobject('SBQQ__Quote__c')
        .select('Id, SBQQ__PriceBook__c, SBQQ__Ordered__c')
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

    return result[0];
}

async function createQuote(transaction) {
    try {
        await connectSf();

        let newQuoteModel;
        const businessUnit = 'XBU';

        let quoteId = await checkQuoteExists(transaction.transactionId);

        //let priceBook = await getPriceBookId(businessUnit);
        //let accountInfo = await getAccountInfo();


        
        
        /*newQuoteModel.record.eComm_Unique_Id__c = transaction.id;
        newQuoteModel.record.SBQQ__Account__c = salesForce.accountId;
        newQuoteModel.record.SBQQ__PrimaryContact__c = salesForce.contactId;
        newQuoteModel.record.Business_Unit__c = businessUnit;
        newQuoteModel.record.Subsidiary__c = accountInfo.AASubsidiary__c;
        newQuoteModel.record.Global_Region__c = accountInfo.GlobalRegion__c;
        newQuoteModel.record.Calculate_Taxes_on_Quote__c = false;
        newQuoteModel.record.CurrencyIsoCode = transaction.currencyIsoCode;
        newQuoteModel.record.SBQQ__Primary__c = true;
        newQuoteModel.record.SBQQ__StartDate__c = new Date();
        newQuoteModel.record.SBQQ__SubscriptionTerm__c = 12;
        newQuoteModel.record.SBQQ__Status__c = 'Approved';
        newQuoteModel.record.ApprovalStatus__c = 'Approved';
        newQuoteModel.record.Approval_Notes__c = 'This is an e-comm purchase and does not require approval notes.';
        newQuoteModel.record.AA_Quote_Doc_Generated__c = true;
        newQuoteModel.record.SBQQ__BillingFrequency__c = 'Annual';
        newQuoteModel.record.Approval_Type__c = 'e-mail / Attach';
        newQuoteModel.record.SBQQ__PaymentTerms__c = 'Due on receipt';
        newQuoteModel.record.SBQQ__PriceBook__c = priceBook.Id;
        newQuoteModel.record.SBQQ__PricebookId__c = priceBook.Id;
        newQuoteModel.record.Payment_Type__c = 'Credit Card';
        newQuoteModel.record.Draft_Order_Id__c = transaction.id;
        newQuoteModel.record.Ship_to_Contact__c = salesForce.contactId;
        newQuoteModel.record.Bill_to_Contact__c = salesForce.contactId;
        newQuoteModel.record.Promo_Code__c = transaction.promoCode;*/

        return quoteId;
    } catch (err) {
        console.info(err);
        throw (err);
    }
}

exports.getEnvironmentId = getEnvironmentId;
exports.createQuote = createQuote;
